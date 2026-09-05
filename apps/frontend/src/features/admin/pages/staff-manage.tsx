import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { FileDown, FileUp, MoreVertical, Pencil, Plus, Search, UserRound, UserRoundX } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { Pagination } from '../components/pagination';

interface Department { _id: string; name: string; }
interface StaffMember { _id: string; email: string; phone?: string; title?: string; department?: Department | null; isActive: boolean; profile?: { firstName?: string; lastName?: string } | null; }
interface StaffForm { firstName: string; lastName: string; gender: string; email: string; phone: string; password: string; organizationId: string; department: string; title: string; }
interface ImportResult { totalRows: number; created: number; failed: number; errors: { row: number; message: string }[]; }
const emptyForm: StaffForm = { firstName: '', lastName: '', gender: 'male', email: '', phone: '', password: '', organizationId: '', department: '', title: '' };
const inputClass = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm';

function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }

function StaffModal({ member, onClose, onSaved }: { member?: StaffMember; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const editing = Boolean(member);
  const [form, setForm] = useState<StaffForm>(member ? { firstName: member.profile?.firstName || '', lastName: member.profile?.lastName || '', gender: 'male', email: member.email, phone: member.phone || '', password: '', organizationId: user?.organizationId || '', department: member.department?.name || '', title: member.title || '' } : { ...emptyForm, organizationId: user?.organizationId || '' });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => { api.get('/departments').then(({ data }) => setDepartments(data.data || [])).catch(() => setDepartments([])); }, []);
  const update = (field: keyof StaffForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { let departmentId = departments.find((department) => department.name.toLowerCase() === form.department.trim().toLowerCase())?._id; if (form.department.trim() && !departmentId) { const { data } = await api.post('/departments', { name: form.department.trim(), tenantId: form.organizationId || undefined }); departmentId = data.data._id; setDepartments((current) => [...current, data.data].sort((a: Department, b: Department) => a.name.localeCompare(b.name))); } const payload = { email: form.email, firstName: form.firstName, lastName: form.lastName, gender: form.gender, phone: form.phone || undefined, title: form.title.trim(), department: departmentId || undefined, ...(editing ? {} : { password: form.password, role: 'staff', organizationId: form.organizationId || undefined }) }; if (editing) await api.patch(`/users/${member!._id}`, payload); else await api.post('/users', payload); onClose(); void onSaved(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to save Staff member'); } finally { setSaving(false); } };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}><div className="w-full max-w-lg rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><h2 className="mb-5 text-xl font-bold">{editing ? 'Edit Staff member' : 'Add Staff member'}</h2>{error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<form onSubmit={submit} className="space-y-3"><div className="grid grid-cols-2 gap-3"><input className={inputClass} placeholder="First name *" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required /><input className={inputClass} placeholder="Last name *" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required /></div><div className="grid grid-cols-2 gap-3"><select className={inputClass} value={form.gender} onChange={(e) => update('gender', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select><input className={inputClass} placeholder="Phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div><div className="grid grid-cols-2 gap-3"><input className={inputClass} placeholder="Department" list="staff-departments" value={form.department} onChange={(e) => update('department', e.target.value)} /><input className={inputClass} placeholder="Title (e.g. HOD, Exam Officer)" value={form.title} onChange={(e) => update('title', e.target.value)} /></div><datalist id="staff-departments">{departments.map((department) => <option key={department._id} value={department.name} />)}</datalist><input className={inputClass} type="email" placeholder="Email *" value={form.email} onChange={(e) => update('email', e.target.value)} required />{!editing && <input className={inputClass} type="password" placeholder="Password *" value={form.password} onChange={(e) => update('password', e.target.value)} minLength={8} required />}<div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border px-4 py-2.5 text-sm">Cancel</button><button disabled={saving} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white">{saving ? 'Saving...' : editing ? 'Update' : 'Create Staff'}</button></div></form></div></div>;
}

function ImportStaffModal({ onClose, onImported }: { onClose: () => void; onImported: (result: ImportResult) => void }) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/users/staff/template', { responseType: 'blob' });
      downloadBlob(response.data, 'staff-template.xlsx');
    } catch { setError('Failed to download template'); }
  };

  const submit = async () => {
    let upload = file;
    if (mode === 'paste') {
      const lines = paste.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setError('Paste the header row and at least one Staff row.'); return; }
      const csv = lines.map((line) => line.split('\t').map((cell) => `"${cell.trim().replace(/"/g, '""')}"`).join(',')).join('\n');
      upload = new File([`\uFEFF${csv}`], 'pasted-staff.csv', { type: 'text/csv' });
    }
    if (!upload) { setError('Please choose an Excel file first.'); return; }
    setBusy(true); setError('');
    try {
      const formData = new FormData();
      formData.append('file', upload);
      const { data } = await api.post('/users/staff/import', formData);
      onImported(data.data);
      onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="border-b border-[var(--color-border-subtle)] px-6 py-5"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">Import Staff</h2><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Select your preferred method to import multiple Staff members into the system.</p></div><button onClick={onClose} disabled={busy} className="rounded-lg p-2 text-xl text-[var(--color-text-tertiary)]">&times;</button></div></div>
      <div className="space-y-6 px-6 py-5">
        <button onClick={downloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 bg-primary-50 px-5 py-4 text-left hover:bg-primary-100"><p className="text-sm font-bold text-primary-700">Download Excel Staff Template</p><p className="mt-1 text-xs text-primary-600/70">Pre-formatted .xlsx file with the correct column structure</p></button>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><button onClick={() => setMode('upload')} className={`rounded-xl border-2 p-4 text-left ${mode === 'upload' ? 'border-primary-500 bg-primary-50' : 'border-[var(--color-border-default)]'}`}><FileUp className="mb-1 h-6 w-6" /><p className="text-sm font-bold">Upload Excel File</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Drag and drop your .xlsx file</p></button><button onClick={() => setMode('paste')} className={`rounded-xl border-2 p-4 text-left ${mode === 'paste' ? 'border-primary-500 bg-primary-50' : 'border-[var(--color-border-default)]'}`}><p className="mb-1 text-2xl">📋</p><p className="text-sm font-bold">Manual Copy & Paste</p><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Paste tabular data from your clipboard</p></button></div>
        {mode === 'upload' ? <div onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); setFile(event.dataTransfer.files?.[0] || null); }} className={`rounded-xl border-2 border-dashed p-10 text-center ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>{file ? <><p className="text-sm font-semibold">{file.name}</p><button onClick={() => setFile(null)} className="mt-2 text-xs text-red-500">Remove file</button></> : <><p className="text-3xl">📂</p><p className="my-3 text-sm font-medium">Drag and drop your Excel file here, or</p><label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white">Browse Files<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><p className="mt-3 text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p></>}</div> : <textarea value={paste} onChange={(event) => { setPaste(event.target.value); setError(''); }} rows={8} placeholder="Paste Excel data here, including the header row..." className="w-full resize-y rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 text-xs font-mono" />}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-6 py-4"><button onClick={onClose} disabled={busy} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm">Cancel</button><button onClick={submit} disabled={busy || (mode === 'upload' && !file) || (mode === 'paste' && !paste.trim())} className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Importing...' : 'Import Staff'}</button></div>
    </div>
  </div>;
}

function RowActions({ member, onEdit, onAccess, onDeactivate }: { member: StaffMember; onEdit: () => void; onAccess: () => void; onDeactivate: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null); const menuRef = useRef<HTMLDivElement>(null); const [open, setOpen] = useState(false); const [position, setPosition] = useState({ top: 0, right: 0 });
  // The menu renders via a portal onto document.body, so it's not a DOM
  // descendant of buttonRef — without also checking menuRef, this listener
  // sees every click inside the menu as "outside" and closes it on
  // mousedown, before the click on Edit/Access/Deactivate ever fires.
  useEffect(() => { if (!open) return; const close = (event: MouseEvent) => { const target = event.target as Node; if (buttonRef.current?.contains(target)) return; if (menuRef.current?.contains(target)) return; setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, [open]);
  const menu = open ? <div ref={menuRef} style={{ position: 'fixed', top: position.top, right: position.right, zIndex: 100 }} className="w-44 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-1 shadow-xl"><button onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-3.5 w-3.5" /> Edit</button><button onClick={() => { setOpen(false); onAccess(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-surface-secondary)]"><UserRound className="h-3.5 w-3.5" /> Access</button>{member.isActive && <button onClick={() => { setOpen(false); onDeactivate(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"><UserRoundX className="h-3.5 w-3.5" /> Deactivate</button>}</div> : null;
  return <><button ref={buttonRef} onClick={() => { const rect = buttonRef.current?.getBoundingClientRect(); if (rect) setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right }); setOpen((value) => !value); }} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]" aria-label="Staff row actions"><MoreVertical className="h-4 w-4" /></button>{menu && createPortal(menu, document.body)}</>;
}

export function StaffManage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<StaffMember>();
  const [showModal, setShowModal] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchStaff = useCallback(async (nextPage = page) => { setLoading(true); setError(''); try { const { data } = await api.get('/users', { params: { role: 'staff', page: nextPage, limit: 10, status: status || undefined, search: search || undefined } }); setStaff(data.data || []); setTotal(data.meta?.total || 0); setPage(nextPage); } catch (err: any) { setError(err.response?.data?.message || 'Failed to load Staff'); } finally { setLoading(false); } }, [page, search, status]);
  useEffect(() => { fetchStaff(1); }, [status]);
  const exportStaff = async () => { try { const response = await api.get('/users/staff/export', { responseType: 'blob' }); downloadBlob(response.data, `staff-export-${new Date().toISOString().slice(0, 10)}.xlsx`); } catch { setError('Failed to export Staff'); } };
  const deactivate = async (member: StaffMember) => { if (!window.confirm(`Deactivate ${member.profile?.firstName || member.email}?`)) return; try { await api.delete(`/users/${member._id}`); setMessage('Staff member deactivated'); fetchStaff(page); } catch (err: any) { setError(err.response?.data?.message || 'Failed to deactivate Staff'); } };
  const handleImported = (result: ImportResult) => { setMessage(`${result.created} of ${result.totalRows} Staff member(s) imported`); if (result.failed) setError(`${result.failed} row(s) failed to import.`); fetchStaff(1); };

  return (
    <div className="p-6 pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><UserRound className="h-7 w-7 text-primary-600" /><h1 className="text-2xl font-bold sm:text-3xl">Manage Staff</h1></div><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Create and manage the staff members of {user?.organizationName || 'your organization'}.</p></div>
          <div className="relative flex-shrink-0"><button onClick={() => setActionsOpen((value) => !value)} className="rounded-xl border p-2.5" aria-label="Staff actions"><MoreVertical className="h-5 w-5" /></button>{actionsOpen && <div className="absolute right-0 top-12 z-20 w-48 rounded-xl border bg-[var(--color-surface-primary)] py-1 shadow-xl"><button onClick={() => { setEditing(undefined); setShowModal(true); setActionsOpen(false); }} className="flex w-full gap-2 px-4 py-2.5 text-left text-sm"><Plus className="h-4 w-4" /> Add Staff</button><button onClick={() => { setShowImport(true); setActionsOpen(false); }} className="flex w-full gap-2 px-4 py-2.5 text-left text-sm"><FileUp className="h-4 w-4" /> Import Staff</button><button onClick={() => { exportStaff(); setActionsOpen(false); }} className="flex w-full gap-2 px-4 py-2.5 text-left text-sm"><FileDown className="h-4 w-4" /> Export Staff</button></div>}</div>
        </header>
        {message && <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="flex flex-col gap-3 rounded-2xl border p-4 lg:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && fetchStaff(1)} /></div><select className="rounded-xl border px-3 py-2.5 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="">All statuses</option></select><button onClick={() => fetchStaff(1)} className="rounded-xl border px-4 py-2.5 text-sm">Search</button></div>
        <div className="overflow-hidden rounded-2xl border bg-[var(--color-surface-primary)]"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-[var(--color-surface-secondary)]"><tr><th className="px-5 py-3">Staff member</th><th className="px-5 py-3">Department</th><th className="px-5 py-3">Title</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={7} className="px-5 py-12 text-center">Loading Staff...</td></tr> : staff.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center">No Staff members found.</td></tr> : staff.map((member) => <tr key={member._id}><td className="px-5 py-4 font-semibold">{`${member.profile?.firstName || ''} ${member.profile?.lastName || ''}`.trim() || 'Unnamed Staff'}</td><td className="px-5 py-4">{member.department?.name || '—'}</td><td className="px-5 py-4">{member.title || '—'}</td><td className="px-5 py-4">{member.email}</td><td className="px-5 py-4">{member.phone || '—'}</td><td className="px-5 py-4"><span className="rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700">{member.isActive ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-4 text-right"><RowActions member={member} onEdit={() => { setEditing(member); setShowModal(true); }} onAccess={() => navigate(`/admin/staff/${member._id}/access`)} onDeactivate={() => deactivate(member)} /></td></tr>)}</tbody></table></div><Pagination page={page} total={total} limit={10} onPageChange={fetchStaff} onLimitChange={() => undefined} itemLabel="Staff members" /></div>
      </div>
      {showModal && <StaffModal key={editing?._id || 'new-staff'} member={editing} onClose={() => setShowModal(false)} onSaved={() => fetchStaff(page)} />}
      {showImport && <ImportStaffModal onClose={() => setShowImport(false)} onImported={handleImported} />}
    </div>
  );
}

export default StaffManage;
