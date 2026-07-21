/**
 * Parent Management — Admin Full CRUD
 * Import / Export + link children
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParentProfile { _id: string; firstName: string; lastName: string; gender: string; }
interface ParentUser { _id: string; email: string; phone?: string; isVerified: boolean; isActive: boolean; }
interface ChildBrief { _id: string; studentId: string; profile?: { firstName: string; lastName: string }; status?: string; }

interface Parent {
  _id: string; parentId: string; user: ParentUser; profile: ParentProfile;
  children: ChildBrief[]; school?: { _id: string; name: string };
  occupation: string; relationship: string;
  address: string; status: 'active' | 'inactive'; createdAt: string;
}

interface ParentForm { email: string; password: string; firstName: string; lastName: string; gender: string; phone: string; occupation: string; relationship: string; address: string; }

interface School { _id: string; name: string; status: 'active' | 'inactive'; }

const emptyForm: ParentForm = { email: '', password: '', firstName: '', lastName: '', gender: 'male', phone: '', occupation: '', relationship: 'father', address: '' };

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400' };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || colors.inactive}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function ParentModal({ parent, onClose, onSaved }: { parent?: Parent; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!parent;
  const [form, setForm] = useState<ParentForm>(parent ? { email: parent.user?.email || '', password: '', firstName: parent.profile?.firstName || '', lastName: parent.profile?.lastName || '', gender: parent.profile?.gender || 'male', phone: parent.user?.phone || '', occupation: parent.occupation || '', relationship: parent.relationship || 'father', address: parent.address || '' } : emptyForm);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const handleChange = (f: keyof ParentForm, v: string) => setForm(p => ({ ...p, [f]: v }));
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setLoading(true); setError(''); try { const payload: any = { firstName: form.firstName, lastName: form.lastName, gender: form.gender, email: form.email, phone: form.phone || undefined, occupation: form.occupation, relationship: form.relationship, address: form.address }; if (form.password) payload.password = form.password; if (isEdit) await api.patch(`/parents/${parent._id}`, payload); else { if (!form.email || !form.password) throw new Error('Email and password are required'); await api.post('/parents', payload); } onSaved(); onClose(); } catch (err: any) { setError(err.response?.data?.message || err.message || 'Failed to save parent'); } finally { setLoading(false); } };
  return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}><div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}><h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Parent' : '➕ Add Parent'}</h2>{error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}<form onSubmit={handleSubmit} className="space-y-3"><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">First Name *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.firstName} onChange={e => handleChange('firstName', e.target.value)} required /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Last Name *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.lastName} onChange={e => handleChange('lastName', e.target.value)} required /></div></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Gender *</label><select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.gender} onChange={e => handleChange('gender', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Email *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} required /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Password {isEdit ? '' : '*'}</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="password" placeholder={isEdit ? 'Leave blank to keep current password' : ''} value={form.password} onChange={e => handleChange('password', e.target.value)} required={!isEdit} minLength={8} /></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Phone Number</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="tel" placeholder="+252XXXXXXXXX" value={form.phone} onChange={e => handleChange('phone', e.target.value)} /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Relationship</label><select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.relationship} onChange={e => handleChange('relationship', e.target.value)}><option value="father">Father</option><option value="mother">Mother</option><option value="guardian">Guardian</option><option value="other">Other</option></select></div></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Occupation</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.occupation} onChange={e => handleChange('occupation', e.target.value)} /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Address</label><textarea className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" rows={2} value={form.address} onChange={e => handleChange('address', e.target.value)} /></div><div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">{loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}</button></div></form></div></div>);
}

function ViewModal({ parent, onClose }: { parent: Parent; onClose: () => void }) {
  const [children, setChildren] = useState<ChildBrief[]>(parent.children || []); const [linkStudentId, setLinkStudentId] = useState(''); const [linkLoading, setLinkLoading] = useState(false); const [linkError, setLinkError] = useState('');
  const fetchChildren = async () => { try { const { data } = await api.get(`/parents/${parent._id}/children`); setChildren(data.data || []); } catch {} };
  const handleLink = async (e: React.FormEvent) => { e.preventDefault(); if (!linkStudentId.trim()) return; setLinkLoading(true); setLinkError(''); try { await api.post(`/parents/${parent._id}/link-child`, { childId: linkStudentId.trim() }); setLinkStudentId(''); fetchChildren(); } catch (err: any) { setLinkError(err.response?.data?.message || 'Failed to link student'); } finally { setLinkLoading(false); } };
  const handleUnlink = async (childId: string) => { try { await api.post(`/parents/${parent._id}/unlink-child`, { childId }); fetchChildren(); } catch (err: any) { alert(err.response?.data?.message || 'Failed to unlink'); } };
  return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}><div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">👨‍👩‍👧 Parent Details</h2><button onClick={onClose} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button></div><div className="space-y-3"><div className="text-center pb-3 border-b"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600 mb-2">{parent.profile?.firstName?.[0]}{parent.profile?.lastName?.[0]}</div><p className="text-lg font-bold">{parent.profile?.firstName} {parent.profile?.lastName}</p><p className="text-sm text-[var(--color-text-tertiary)]">{parent.parentId}</p></div><DR label="Email" value={parent.user?.email} /><DR label="Phone" value={parent.user?.phone || '—'} /><DR label="Status" value={<StatusBadge status={parent.status} />} /><DR label="Gender" value={parent.profile?.gender || '—'} /><DR label="Occupation" value={parent.occupation || '—'} /><DR label="Relationship" value={parent.relationship} /><DR label="Address" value={parent.address || '—'} /></div><div className="mt-4 pt-3 border-t"><h3 className="text-sm font-bold mb-2">Linked Children ({children.length})</h3>{children.length === 0 ? <p className="text-xs text-[var(--color-text-tertiary)]">No children linked yet.</p> : <ul className="space-y-1 mb-3">{children.map(c => (<li key={c._id} className="flex items-center justify-between text-sm"><span className="font-medium">{c.studentId}</span><button onClick={() => handleUnlink(c._id)} className="text-xs text-red-500 hover:underline">Unlink</button></li>))}</ul>}<form onSubmit={handleLink} className="flex gap-2"><input className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs" placeholder="Enter Student ID to link..." value={linkStudentId} onChange={e => setLinkStudentId(e.target.value)} /><button type="submit" disabled={linkLoading} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{linkLoading ? '...' : 'Link'}</button></form>{linkError && <p className="text-red-500 text-xs mt-1">{linkError}</p>}</div><button onClick={onClose} className="mt-5 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Close</button></div></div>);
}

function DR({ label, value }: { label: string; value: React.ReactNode }) { return <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)] last:border-0"><span className="text-sm text-[var(--color-text-tertiary)]">{label}</span><span className="text-sm font-medium text-[var(--color-text-primary)] text-right max-w-[60%]">{value}</span></div>; }

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Three-Dot Actions Dropdown
// ---------------------------------------------------------------------------

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

export function ParentsManage() {
  const { user } = useAuth(); const isSuperAdmin = user?.role === 'admin'; const isOrgAdmin = user?.role === 'org_admin';

  const [parents, setParents] = useState<Parent[]>([]); const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState(''); const [filterSchool, setFilterSchool] = useState('');
  const [hasFetched, setHasFetched] = useState(false); const [showCreate, setShowCreate] = useState(false);
  const [editingParent, setEditingParent] = useState<Parent | undefined>(undefined); const [viewingParent, setViewingParent] = useState<Parent | undefined>(undefined);
  const limit = 15;

  // Import / Export state
  const [showImportModal, setShowImportModal] = useState(false); const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [dragOver, setDragOver] = useState(false); const [pasteText, setPasteText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null); const [pasteError, setPasteError] = useState('');
  const [importing, setImporting] = useState(false); const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalRows: number; created: number; failed: number; errors: { row: number; message: string }[] } | null>(null);

  useEffect(() => { (async () => { try { const { data } = await api.get('/schools', { params: { limit: '100' } }); setSchools(data.data || []); } catch {} })(); }, []);

  const fetchParents = useCallback(async (pageNum = 1) => { setLoading(true); setError(''); try { const params: any = { page: String(pageNum), limit: String(limit) }; if (search) params.search = search; if (statusFilter) params.status = statusFilter; if (filterSchool) params.school = filterSchool; const { data } = await api.get('/parents', { params }); setParents(data.data || []); setTotal(data.meta?.total || 0); setHasFetched(true); } catch (err: any) { setError(err.response?.data?.message || 'Failed to load parents'); } finally { setLoading(false); } }, [search, statusFilter, filterSchool]);

  useEffect(() => { if (isOrgAdmin) fetchParents(1); }, [isOrgAdmin]);

  const handleApplyFilters = () => { if (isSuperAdmin && !filterSchool) { setError('Please select an organization to view parents.'); return; } setPage(1); fetchParents(1); };
  const handlePageChange = (np: number) => { setPage(np); fetchParents(np); };
  const handleStatusChange = async (id: string, ns: string) => { try { await api.patch(`/parents/${id}/status`, { status: ns }); setParents(p => p.map(x => x._id === id ? { ...x, status: ns as Parent['status'] } : x)); } catch (err: any) { alert(err.response?.data?.message || 'Failed to update status'); } };
  const handleDelete = async (id: string) => { if (!window.confirm('Delete this parent? Children will be unlinked.')) return; try { await api.delete(`/parents/${id}`); fetchParents(page); } catch (err: any) { alert(err.response?.data?.message || 'Failed to delete'); } };

  // ───────────────────────────────────────────────────────────────────────
  // Import Modal Logic
  // ───────────────────────────────────────────────────────────────────────
  const openImportModal = () => { setShowImportModal(true); setImportMode('upload'); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };
  const closeImportModal = () => { setShowImportModal(false); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };
  const handleDownloadTemplate = async () => { try { const token = localStorage.getItem('accessToken') || ''; const r = await fetch(`${api.defaults.baseURL}/parents/template`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error('Download failed'); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'parents-template.xlsx'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch { setError('Failed to download template'); } };
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setSelectedFile(f); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); };
  const submitFileImport = async () => { if (!selectedFile) return; setImporting(true); setError(''); setImportResult(null); try { const fd = new FormData(); fd.append('file', selectedFile); const { data } = await api.post('/parents/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); setImportResult(data.data); if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} parents`); fetchParents(page); closeImportModal(); } } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); } };
  const parsePastedRows = (): string[][] => { if (!pasteText.trim()) return []; return pasteText.trim().split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())).filter(r => r.length > 0 && r.some(c => c !== '')); };
  const submitPasteImport = async () => { const rows = parsePastedRows(); if (rows.length === 0) { setPasteError('Please paste at least one row of data before submitting.'); return; } if (rows[0].length < 6) { setPasteError('Expected 9 columns (First Name, Last Name, Gender, Email, Password, Phone Number, Occupation, Address, Student Association). Found ' + rows[0].length + '.'); return; } const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); const file = new File([blob], 'pasted-parents.csv', { type: 'text/csv' }); setImporting(true); setError(''); setImportResult(null); setPasteError(''); try { const fd = new FormData(); fd.append('file', file); const { data } = await api.post('/parents/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); setImportResult(data.data); if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} parents`); fetchParents(page); closeImportModal(); } } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); } };
  const handleExport = async () => { setExporting(true); setError(''); try { const token = localStorage.getItem('accessToken') || ''; const r = await fetch(`${api.defaults.baseURL}/parents/export`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error('Export failed'); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `parents-export-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); setMessage('Export downloaded successfully'); } catch (err: any) { setError(err.message || 'Export failed'); } finally { setExporting(false); } };

  const totalPages = Math.ceil(total / limit);
  const activeCount = parents.filter(p => p.status === 'active').length;
  const inactiveCount = parents.filter(p => p.status === 'inactive').length;
  const totalChildren = parents.reduce((sum, p) => sum + (p.children?.length || 0), 0);
  const parsedRows = parsePastedRows();

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header + Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">👨‍👩‍👧‍👦 Manage Parents</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{hasFetched ? `${total} total — ${activeCount} active, ${inactiveCount} inactive, ${totalChildren} children linked` : 'Apply a filter to view parents'}</p></div>
          <div className="flex gap-3">
            <ActionsDropdown onImport={openImportModal} onExport={handleExport} exporting={exporting} label="Parents" />
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ Add Parent</button>
          </div>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

        {/* ═══════════════════════════════════════════════════════════════
            Import Modal
           ═══════════════════════════════════════════════════════════════ */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
              <div className="border-b border-[var(--color-border-subtle)] px-6 py-5"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Parents</h2><p className="text-sm text-[var(--color-text-tertiary)] mt-1">Select your preferred method to import multiple parents into the system.</p></div><button onClick={closeImportModal} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors" disabled={importing}><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div></div>
              <div className="px-6 py-5 space-y-6">
                <button onClick={handleDownloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-2xl">📥</span><div><p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Parent Template</p><p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Pre-formatted .xlsx file with the correct column structure</p></div></div><svg className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></div></button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setImportMode('upload'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'upload' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}><span className="text-2xl block mb-1">📁</span><p className={`text-sm font-bold ${importMode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Upload Excel File</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Drag and drop your .xlsx file</p></button>
                  <button onClick={() => { setImportMode('paste'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'paste' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}><span className="text-2xl block mb-1">📋</span><p className={`text-sm font-bold ${importMode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Manual Copy & Paste</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Paste tabular data from your clipboard</p></button>
                </div>
                {importMode === 'upload' && (<div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>{selectedFile ? (<div className="space-y-3"><span className="text-3xl">✅</span><p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p><button onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button></div>) : (<div className="space-y-3"><span className="text-3xl">📂</span><p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop your Excel file here, or</p><label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">Browse Files<input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInputChange} className="hidden" /></label><p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p></div>)}</div>)}
                {importMode === 'paste' && (<div className="space-y-3"><div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below (tab-separated columns, one row per line):</p><p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">First Name &nbsp; Last Name &nbsp; Gender &nbsp; Email &nbsp; Password &nbsp; Phone Number &nbsp; Occupation &nbsp; Address &nbsp; Student Association</p><textarea value={pasteText} onChange={e => { setPasteText(e.target.value); setPasteError(''); }} rows={8} placeholder={"Paste data from Excel here...\n\nExample:\nMohamed\tAli\tmale\tmohamed@example.com\tchangeme123\t+252612345678\tEngineer\tMogadishu, Somalia\tSTU-2026-0001"} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y" /></div>{pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}{parsedRows.length > 0 && (<div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden"><div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed</div><div className="max-h-40 overflow-auto"><table className="w-full text-xs"><tbody className="divide-y divide-[var(--color-border-subtle)]">{parsedRows.slice(0, 20).map((row, ri) => (<tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>{row.map((cell, ci) => (<td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>))}</tr>))}</tbody></table></div></div>)}</div>)}
                {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
              </div>
              <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between"><button onClick={closeImportModal} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button><button onClick={importMode === 'upload' ? submitFileImport : submitPasteImport} disabled={importing || (importMode === 'upload' && !selectedFile) || (importMode === 'paste' && !pasteText.trim())} className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2">{importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Parents'}</button></div>
              {importResult && (<div className="border-t border-[var(--color-border-subtle)] px-6 py-4 space-y-2"><p className="text-sm font-semibold text-[var(--color-text-primary)]">{importResult.created} of {importResult.totalRows} rows imported successfully{importResult.failed > 0 && ` — ${importResult.failed} failed`}</p>{importResult.errors.length > 0 && (<div className="max-h-36 overflow-y-auto rounded-lg border border-red-200 dark:border-red-900/40"><table className="w-full text-xs"><thead className="bg-red-50 dark:bg-red-950/30 text-left text-red-700 dark:text-red-300"><tr><th className="px-3 py-1.5">Row</th><th className="px-3 py-1.5">Error</th></tr></thead><tbody className="divide-y divide-red-100 dark:divide-red-900/30">{importResult.errors.map((e, idx) => (<tr key={idx}><td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{e.row}</td><td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td></tr>))}</tbody></table></div>)}</div>)}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            Filters + Table (existing)
           ═══════════════════════════════════════════════════════════════ */}

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {isOrgAdmin ? (<div className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">{schools[0]?.name || 'Your Organization'}</div>) : (<select value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setHasFetched(false); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">{isSuperAdmin ? 'Select an Organization...' : 'Select Organization...'}</option>{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select>)}
            <input type="text" placeholder="Search by name, email, or parent ID..." value={search} onChange={e => { setSearch(e.target.value); setHasFetched(false); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleApplyFilters(); }} />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setHasFetched(false); }} className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm"><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            <button onClick={handleApplyFilters} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors whitespace-nowrap">🔍 Apply Filters</button>
          </div>
        </div>

        {error && !showImportModal && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={handleApplyFilters} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && !hasFetched && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">🔍</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Please apply a filter to view records.</p><p className="text-sm text-[var(--color-text-tertiary)]">{isSuperAdmin ? 'Select an organization and click "Apply Filters" to load parents.' : 'Click "Apply Filters" to load parents for your organization.'}</p></div>}
        {!loading && hasFetched && parents.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">👨‍👩‍👧‍👦</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No parents found</p><p className="text-sm text-[var(--color-text-tertiary)]">Try adjusting your filters or click "+ Add Parent" to create one.</p></div>}

        {!loading && hasFetched && parents.length > 0 && (<><div className="grid grid-cols-3 gap-4"><div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{activeCount}</p><p className="text-xs text-green-600 dark:text-green-400">Active</p></div><div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-4 text-center"><p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{inactiveCount}</p><p className="text-xs text-gray-500 dark:text-gray-500">Inactive</p></div><div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-center"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalChildren}</p><p className="text-xs text-blue-600 dark:text-blue-400">Children</p></div></div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]"><tr><th className="text-left px-5 py-3 font-semibold">Parent</th><th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Organization</th><th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Children</th><th className="text-center px-5 py-3 font-semibold">Status</th><th className="text-center px-5 py-3 font-semibold">Actions</th></tr></thead><tbody>{parents.map(p => (<tr key={p._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer" onClick={() => setViewingParent(p)}><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-sm font-bold text-primary-600 flex-shrink-0">{p.profile?.firstName?.[0]}{p.profile?.lastName?.[0]}</div><div className="min-w-0"><p className="font-semibold truncate">{p.profile?.firstName} {p.profile?.lastName}</p><p className="text-xs text-[var(--color-text-tertiary)] truncate">{p.user?.email}</p></div></div></td><td className="px-5 py-4 hidden md:table-cell text-sm text-[var(--color-text-secondary)]">{p.school?.name || '—'}</td><td className="px-5 py-4 text-center hidden sm:table-cell"><span className="font-medium">{p.children?.length || 0}</span></td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><select value={p.status} onChange={e => handleStatusChange(p._id, e.target.value)} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs font-medium cursor-pointer"><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><div className="flex items-center justify-center gap-1"><button onClick={() => setEditingParent(p)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30" title="Edit">✏️</button><button onClick={() => handleDelete(p._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete">🗑️</button></div></td></tr>))}</tbody></table></div></div></>)}

        {totalPages > 1 && (<div className="flex items-center justify-center gap-3"><button disabled={page <= 1} onClick={() => handlePageChange(page - 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button><span className="text-sm text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button></div>)}
      </div>

      {showCreate && <ParentModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchParents(page); }} />}
      {editingParent && <ParentModal parent={editingParent} onClose={() => setEditingParent(undefined)} onSaved={() => { setEditingParent(undefined); fetchParents(page); }} />}
      {viewingParent && <ViewModal parent={viewingParent} onClose={() => setViewingParent(undefined)} />}
    </div>
  );
}

export default ParentsManage;
