/**
 * Teacher Management — Admin CRUD
 * Import / Export + Full CRUD
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeacherProfile { _id: string; firstName: string; lastName: string; gender: string; }
interface TeacherUser { _id: string; email: string; isVerified: boolean; isActive: boolean; }
interface TeacherCourse { _id: string; title: { en: string }; slug: string; }
interface TeacherSchool { _id: string; name: string; }

interface Teacher {
  _id: string; teacherId: string; user: TeacherUser; profile: TeacherProfile;
  school?: TeacherSchool; qualification: string; specialization: string[];
  experience: number; bio: string; courses: TeacherCourse[];
  coursePermission?: 'COURSE_BUILDER' | 'STUDENT_VIEW';
  status: 'active' | 'inactive' | 'on_leave'; joiningDate: string; createdAt: string;
}

interface TeacherForm {
  email: string; password: string; firstName: string; lastName: string;
  gender: string; phone: string; school: string; qualification: string;
  specialization: string; experience: number; bio: string; joiningDate: string;
}

interface School { _id: string; name: string; status: 'active' | 'inactive'; }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const emptyForm: TeacherForm = {
  email: '', password: '', firstName: '', lastName: '', gender: 'male', phone: '',
  school: '', qualification: '', specialization: '', experience: 0, bio: '',
  joiningDate: new Date().toISOString().split('T')[0],
};

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    inactive: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    on_leave: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>{status.replace('_', ' ')}</span>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-border-subtle)] last:border-0"><span className="text-sm text-[var(--color-text-tertiary)]">{label}</span><span className="text-sm font-medium text-[var(--color-text-primary)] text-right max-w-[60%]">{value}</span></div>;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function TeacherModal({ teacher, onClose, onSaved }: { teacher?: Teacher; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!teacher;
  const [form, setForm] = useState<TeacherForm>(teacher ? {
    email: teacher.user?.email || '', password: '',
    firstName: teacher.profile?.firstName || '', lastName: teacher.profile?.lastName || '',
    gender: teacher.profile?.gender || 'male', phone: '',
    school: teacher.school?._id || '', qualification: teacher.qualification || '',
    specialization: (teacher.specialization || []).join(', '), experience: teacher.experience || 0,
    bio: teacher.bio || '', joiningDate: teacher.joiningDate ? new Date(teacher.joiningDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
  } : emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);

  useEffect(() => { (async () => { try { const { data } = await api.get('/schools', { params: { limit: '100' } }); setSchools(data.data || []); } catch {} finally { setSchoolsLoading(false); } })(); }, []);

  const handleChange = (field: keyof TeacherForm, value: string | number) => { setForm(p => ({ ...p, [field]: value })); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload = { firstName: form.firstName, lastName: form.lastName, gender: form.gender, school: form.school || undefined, qualification: form.qualification, specialization: form.specialization.split(',').map(s => s.trim()).filter(Boolean), experience: Number(form.experience), bio: form.bio, joiningDate: form.joiningDate, ...(isEdit ? {} : { email: form.email, password: form.password, phone: form.phone || undefined }) };
      if (isEdit) await api.patch(`/teachers/${teacher._id}`, payload);
      else { if (!form.email || !form.password) throw new Error('Email and password are required'); await api.post('/teachers', payload); }
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || err.message || 'Failed to save teacher'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Teacher' : '➕ Add Teacher'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">First Name *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.firstName} onChange={e => handleChange('firstName', e.target.value)} required /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Last Name *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.lastName} onChange={e => handleChange('lastName', e.target.value)} required /></div></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Gender *</label><select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.gender} onChange={e => handleChange('gender', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Organization *</label><select className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.school} onChange={e => handleChange('school', e.target.value)} required disabled={schoolsLoading}><option value="">{schoolsLoading ? 'Loading...' : '-- Select Organization --'}</option>{schools.filter(s => s.status === 'active').map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
          {!isEdit && <><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Email *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} required /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Password *</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="password" value={form.password} onChange={e => handleChange('password', e.target.value)} required minLength={8} /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Phone</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" value={form.phone} onChange={e => handleChange('phone', e.target.value)} /></div></>}
          <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Qualification</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="e.g. Bachelor's in Islamic Studies" value={form.qualification} onChange={e => handleChange('qualification', e.target.value)} /></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Specialization (comma separated)</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" placeholder="e.g. Tajweed, Fiqh, Hadith" value={form.specialization} onChange={e => handleChange('specialization', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Experience (years)</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="number" min={0} value={form.experience} onChange={e => handleChange('experience', Number(e.target.value))} /></div><div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Joining Date</label><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" type="date" value={form.joiningDate} onChange={e => handleChange('joiningDate', e.target.value)} /></div></div>
          <div><label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Bio</label><textarea className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" rows={2} value={form.bio} onChange={e => handleChange('bio', e.target.value)} /></div>
          <div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors">{loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}</button></div>
        </form>
      </div>
    </div>
  );
}

function ViewModal({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">👨‍🏫 Teacher Details</h2><button onClick={onClose} className="text-2xl leading-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&times;</button></div>
        <div className="space-y-3">
          <div className="text-center pb-3 border-b"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600 mb-2">{teacher.profile?.firstName?.[0]}{teacher.profile?.lastName?.[0]}</div><p className="text-lg font-bold">{teacher.profile?.firstName} {teacher.profile?.lastName}</p><p className="text-sm text-[var(--color-text-tertiary)]">{teacher.teacherId}</p></div>
          <DetailRow label="Email" value={teacher.user?.email} />
          <DetailRow label="Organization" value={teacher.school?.name || '—'} />
          <DetailRow label="Qualification" value={teacher.qualification || '—'} />
          <DetailRow label="Specialization" value={teacher.specialization?.length ? teacher.specialization.join(', ') : '—'} />
          <DetailRow label="Experience" value={teacher.experience ? `${teacher.experience} years` : '—'} />
          <DetailRow label="Status" value={<StatusBadge status={teacher.status} />} />
          <DetailRow label="Courses" value={teacher.courses?.length ? `${teacher.courses.length} course(s)` : 'None assigned'} />
          <DetailRow label="Joined" value={teacher.joiningDate ? new Date(teacher.joiningDate).toLocaleDateString() : '—'} />
          <DetailRow label="Bio" value={teacher.bio || '—'} />
        </div>
        <button onClick={onClose} className="mt-5 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Close</button>
      </div>
    </div>
  );
}

function PermissionModal({ teacher, onClose, onSaved }: { teacher: Teacher; onClose: () => void; onSaved: () => void }) {
  const currentPerm = teacher.coursePermission || 'COURSE_BUILDER';
  const [selected, setSelected] = useState<string>(currentPerm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const handleSave = async () => { setSaving(true); setError(''); try { await api.patch(`/teachers/${teacher._id}/course-permission`, { coursePermission: selected }); onSaved(); onClose(); } catch (err: any) { setError(err.response?.data?.message || 'Failed to update permission'); } finally { setSaving(false); } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">Course Content Permission</h2><p className="text-xs text-[var(--color-text-tertiary)] mb-4">{teacher.profile?.firstName} {teacher.profile?.lastName}</p>
        {error && <p className="text-red-500 text-xs mb-3 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-2">
          <label className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all ${selected === 'COURSE_BUILDER' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-[var(--color-border-default)] hover:border-emerald-300'}`}>
            <input type="radio" name="cp" value="COURSE_BUILDER" checked={selected === 'COURSE_BUILDER'} onChange={() => setSelected('COURSE_BUILDER')} className="mt-0.5 accent-emerald-600" />
            <div><span className="text-sm font-semibold text-[var(--color-text-primary)]">Course Builder</span><p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">Full write/edit access to course structure, chapters, and content blocks.</p></div>
          </label>
          <label className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all ${selected === 'STUDENT_VIEW' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-[var(--color-border-default)] hover:border-amber-300'}`}>
            <input type="radio" name="cp" value="STUDENT_VIEW" checked={selected === 'STUDENT_VIEW'} onChange={() => setSelected('STUDENT_VIEW')} className="mt-0.5 accent-amber-600" />
            <div><span className="text-sm font-semibold text-[var(--color-text-primary)]">Student View</span><p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">Read-only access. Same view as a student — no editing or saving allowed.</p></div>
          </label>
        </div>
        <div className="flex gap-2 mt-5"><button onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-xs font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button><button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">{saving ? 'Saving...' : 'Save'}</button></div>
      </div>
    </div>
  );
}

function ThreeDotsMenu({ teacher, onEdit, onDelete }: { teacher: Teacher; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false); const buttonRef = useRef<HTMLButtonElement>(null); const menuRef = useRef<HTMLDivElement>(null); const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); if (!open && buttonRef.current) { const r = buttonRef.current.getBoundingClientRect(); setMenuStyle({ position: 'fixed', top: r.bottom + 4, left: r.right - 208, zIndex: 100 }); } setOpen(!open); };
  const act = (action: () => void) => { setOpen(false); action(); };
  return (<><button ref={buttonRef} onClick={toggle} className="p-2 rounded-lg hover:bg-[var(--color-surface-tertiary)] transition-colors" title="Actions"><svg className="h-4 w-4 text-[var(--color-text-secondary)]" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" /></svg></button>{open && createPortal(<div ref={menuRef} style={menuStyle} className="w-52 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-elevated py-1"><button onClick={() => act(onEdit)} className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] flex items-center gap-2">✏️ Edit Profile</button><div className="border-t border-[var(--color-border-subtle)] my-1" /><button onClick={() => act(onDelete)} className="w-full text-left px-4 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2">🗑️ Delete Teacher</button></div>, document.body)}</>);
}

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

export function TeachersManage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const isOrgAdmin = user?.role === 'org_admin';

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | undefined>(undefined);
  const [viewingTeacher, setViewingTeacher] = useState<Teacher | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [hasFetched, setHasFetched] = useState(false);

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

  useEffect(() => { (async () => { try { const { data } = await api.get('/schools', { params: { limit: '100' } }); setSchools(data.data || []); } catch {} })(); }, []);

  const fetchTeachers = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = {}; if (search) params.search = search; if (statusFilter) params.status = statusFilter; if (filterSchool) params.school = filterSchool;
      const { data } = await api.get('/teachers', { params });
      setTeachers(data.data || []); setHasFetched(true);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load teachers'); }
    finally { setLoading(false); }
  }, [search, statusFilter, filterSchool]);

  useEffect(() => { if (isOrgAdmin) fetchTeachers(); }, [isOrgAdmin]);

  const handleApplyFilters = () => { if (isSuperAdmin && !filterSchool) { setError('Please select an organization to view teachers.'); return; } fetchTeachers(); };
  const handleDelete = async (id: string, name: string) => { if (!window.confirm(`Delete teacher "${name}"?`)) return; try { await api.delete(`/teachers/${id}`); setTeachers(p => p.filter(t => t._id !== id)); } catch (err: any) { alert(err.response?.data?.message || 'Failed to delete'); } };
  const handleStatusToggle = async (id: string, currentStatus: string) => { const ns = currentStatus === 'active' ? 'inactive' : 'active'; try { await api.patch(`/teachers/${id}/status`, { status: ns }); setTeachers(p => p.map(t => t._id === id ? { ...t, status: ns as Teacher['status'] } : t)); } catch (err: any) { alert(err.response?.data?.message || 'Failed to update status'); } };

  // ───────────────────────────────────────────────────────────────────────
  // Import Modal Logic
  // ───────────────────────────────────────────────────────────────────────

  const openImportModal = () => { setShowImportModal(true); setImportMode('upload'); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };
  const closeImportModal = () => { setShowImportModal(false); setSelectedFile(null); setPasteText(''); setPasteError(''); setImportResult(null); };

  const handleDownloadTemplate = async () => { try { const token = localStorage.getItem('accessToken') || ''; const r = await fetch(`${api.defaults.baseURL}/teachers/template`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error('Download failed'); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'teachers-template.xlsx'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch { setError('Failed to download template'); } };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setSelectedFile(f); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); };

  const submitFileImport = async () => { if (!selectedFile) return; setImporting(true); setError(''); setImportResult(null); try { const fd = new FormData(); fd.append('file', selectedFile); const { data } = await api.post('/teachers/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); setImportResult(data.data); if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} teachers`); fetchTeachers(); closeImportModal(); } } catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); } };

  const parsePastedRows = (): string[][] => { if (!pasteText.trim()) return []; return pasteText.trim().split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())).filter(r => r.length > 0 && r.some(c => c !== '')); };

  const submitPasteImport = async () => {
    const rows = parsePastedRows();
    if (rows.length === 0) { setPasteError('Please paste at least one row of data before submitting.'); return; }
    if (rows[0].length < 6) { setPasteError('Expected 11 columns (First Name, Last Name, Gender, Email, Password, Phone, Qualification, Specialization, Experience, Joining Date, Bio). Found ' + rows[0].length + '.'); return; }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], 'pasted-teachers.csv', { type: 'text/csv' });
    setImporting(true); setError(''); setImportResult(null); setPasteError('');
    try { const fd = new FormData(); fd.append('file', file); const { data } = await api.post('/teachers/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); setImportResult(data.data); if (data.data?.created > 0) { setMessage(`Imported ${data.data.created} of ${data.data.totalRows} teachers`); fetchTeachers(); closeImportModal(); } }
    catch (err: any) { setError(err.response?.data?.message || 'Import failed'); } finally { setImporting(false); }
  };

  const handleExport = async () => { setExporting(true); setError(''); try { const token = localStorage.getItem('accessToken') || ''; const r = await fetch(`${api.defaults.baseURL}/teachers/export`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error('Export failed'); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `teachers-export-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); setMessage('Export downloaded successfully'); } catch (err: any) { setError(err.message || 'Export failed'); } finally { setExporting(false); } };

  const activeCount = teachers.filter(t => t.status === 'active').length;
  const inactiveCount = teachers.filter(t => t.status === 'inactive').length;
  const onLeaveCount = teachers.filter(t => t.status === 'on_leave').length;
  const parsedRows = parsePastedRows();

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header + Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">👨‍🏫 Manage Teachers</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{hasFetched ? `${teachers.length} total — ${activeCount} active, ${inactiveCount} inactive, ${onLeaveCount} on leave` : 'Apply a filter to view teachers'}</p></div>
          <div className="flex gap-3">
            <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); submitFileImport(); } }} className="hidden" />
            <ActionsDropdown onImport={openImportModal} onExport={handleExport} exporting={exporting} label="Teachers" />
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">+ Add Teacher</button>
          </div>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}

        {/* ═══════════════════════════════════════════════════════════════
            Import Modal
           ═══════════════════════════════════════════════════════════════ */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
              <div className="border-b border-[var(--color-border-subtle)] px-6 py-5"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold text-[var(--color-text-primary)]">Import Teachers</h2><p className="text-sm text-[var(--color-text-tertiary)] mt-1">Select your preferred method to import multiple teachers into the system.</p></div><button onClick={closeImportModal} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors" disabled={importing}><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div></div>
              <div className="px-6 py-5 space-y-6">
                <button onClick={handleDownloadTemplate} className="w-full rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/20 px-5 py-4 text-left hover:bg-primary-100 dark:hover:bg-primary-950/40 transition-colors group"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-2xl">📥</span><div><p className="text-sm font-bold text-primary-700 dark:text-primary-300 group-hover:text-primary-800 dark:group-hover:text-primary-200">Download Excel Teacher Template</p><p className="text-xs text-primary-600/70 dark:text-primary-400/70 mt-0.5">Pre-formatted .xlsx file with the correct column structure</p></div></div><svg className="h-5 w-5 text-primary-500 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></div></button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setImportMode('upload'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'upload' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}><span className="text-2xl block mb-1">📁</span><p className={`text-sm font-bold ${importMode === 'upload' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Upload Excel File</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Drag and drop your .xlsx file</p></button>
                  <button onClick={() => { setImportMode('paste'); setPasteError(''); }} className={`rounded-xl border-2 p-4 text-left transition-all ${importMode === 'paste' ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 shadow-sm' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface-primary)]'}`}><span className="text-2xl block mb-1">📋</span><p className={`text-sm font-bold ${importMode === 'paste' ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-primary)]'}`}>Manual Copy & Paste</p><p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Paste tabular data from your clipboard</p></button>
                </div>
                {importMode === 'upload' && (
                  <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop} className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]'}`}>
                    {selectedFile ? (<div className="space-y-3"><span className="text-3xl">✅</span><p className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedFile.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p><button onClick={() => setSelectedFile(null)} className="text-xs text-red-500 hover:underline">Remove file</button></div>) : (<div className="space-y-3"><span className="text-3xl">📂</span><p className="text-sm font-medium text-[var(--color-text-secondary)]">Drag and drop your Excel file here, or</p><label className="inline-block cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors">Browse Files<input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInputChange} className="hidden" /></label><p className="text-xs text-[var(--color-text-tertiary)]">Supported formats: .xlsx, .xls, .csv (max 10 MB)</p></div>)}
                  </div>
                )}
                {importMode === 'paste' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4"><p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">Paste your spreadsheet data below (tab-separated columns, one row per line):</p><p className="text-xs text-[var(--color-text-tertiary)] mb-3 font-mono">First Name &nbsp; Last Name &nbsp; Gender &nbsp; Email &nbsp; Password &nbsp; Phone &nbsp; Qualification &nbsp; Specialization &nbsp; Experience &nbsp; Joining Date &nbsp; Bio</p><textarea value={pasteText} onChange={e => { setPasteText(e.target.value); setPasteError(''); }} rows={8} placeholder={"Paste data from Excel here...\n\nExample:\nAhmed\tHassan\tmale\tahmed@example.com\tchangeme123\t+252612345678\tBachelor of Islamic Studies\tTajweed, Fiqh\t5\t2026-01-15\tExperienced Quran teacher."} className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y" /></div>
                    {pasteError && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{pasteError}</div>}
                    {parsedRows.length > 0 && (<div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden"><div className="bg-[var(--color-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-tertiary)]">Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed</div><div className="max-h-40 overflow-auto"><table className="w-full text-xs"><tbody className="divide-y divide-[var(--color-border-subtle)]">{parsedRows.slice(0, 20).map((row, ri) => (<tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--color-surface-primary)]' : 'bg-[var(--color-surface-secondary)]'}>{row.map((cell, ci) => (<td key={ci} className="px-3 py-1.5 text-[var(--color-text-secondary)] whitespace-nowrap border-r border-[var(--color-border-subtle)] last:border-r-0">{cell}</td>))}</tr>))}</tbody></table></div></div>)}
                  </div>
                )}
                {error && <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">{error}</div>}
              </div>
              <div className="border-t border-[var(--color-border-subtle)] px-6 py-4 flex items-center justify-between"><button onClick={closeImportModal} disabled={importing} className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors disabled:opacity-50">Cancel</button><button onClick={importMode === 'upload' ? submitFileImport : submitPasteImport} disabled={importing || (importMode === 'upload' && !selectedFile) || (importMode === 'paste' && !pasteText.trim())} className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2">{importing ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importing...</> : 'Import Teachers'}</button></div>
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
            <input className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" placeholder="Search by name, email, or ID..." value={search} onChange={e => { setSearch(e.target.value); setHasFetched(false); }} onKeyDown={e => { if (e.key === 'Enter') handleApplyFilters(); }} />
            <select className="flex-1 sm:flex-none sm:w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setHasFetched(false); }}><option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On Leave</option></select>
            <button onClick={handleApplyFilters} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors whitespace-nowrap">🔍 Apply Filters</button>
          </div>
        </div>

        {error && !showImportModal && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={handleApplyFilters} className="text-primary-600 font-medium text-sm hover:underline">Retry</button></div>}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}
        {!loading && !hasFetched && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">🔍</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">Please apply a filter to view records.</p><p className="text-sm text-[var(--color-text-tertiary)]">{isSuperAdmin ? 'Select an organization and click "Apply Filters" to load teachers.' : 'Click "Apply Filters" to load teachers for your organization.'}</p></div>}
        {!loading && hasFetched && teachers.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-16 text-center shadow-card"><p className="text-4xl mb-4">👨‍🏫</p><p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No teachers found</p><p className="text-sm text-[var(--color-text-tertiary)]">Try adjusting your filters or click "+ Add Teacher" to create one.</p></div>}

        {!loading && hasFetched && teachers.length > 0 && (<><div className="grid grid-cols-3 gap-4"><div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{activeCount}</p><p className="text-xs text-green-600 dark:text-green-400">Active</p></div><div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-center"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{onLeaveCount}</p><p className="text-xs text-amber-600 dark:text-amber-400">On Leave</p></div><div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-2xl font-bold text-red-700 dark:text-red-300">{inactiveCount}</p><p className="text-xs text-red-600 dark:text-red-400">Inactive</p></div></div>
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-visible shadow-card"><div className="overflow-x-auto overflow-y-visible"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]"><tr><th className="text-left px-5 py-3 font-semibold">Teacher</th><th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Organization</th><th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Specialization</th><th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Courses</th><th className="text-center px-5 py-3 font-semibold">Status</th><th className="text-center px-5 py-3 font-semibold">Actions</th></tr></thead><tbody>{teachers.map(t => (<tr key={t._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer" onClick={() => setViewingTeacher(t)}><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-sm font-bold text-primary-600 flex-shrink-0">{t.profile?.firstName?.[0]}{t.profile?.lastName?.[0]}</div><div className="min-w-0"><p className="font-semibold truncate">{t.profile?.firstName} {t.profile?.lastName}</p><p className="text-xs text-[var(--color-text-tertiary)] truncate">{t.user?.email}</p></div></div></td><td className="px-5 py-4 hidden md:table-cell text-sm text-[var(--color-text-secondary)]">{t.school?.name || '—'}</td><td className="px-5 py-4 hidden lg:table-cell"><div className="flex flex-wrap gap-1">{(t.specialization || []).slice(0, 3).map(s => <span key={s} className="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{s}</span>)}{(t.specialization || []).length > 3 && <span className="text-xs text-[var(--color-text-tertiary)]">+{t.specialization.length - 3}</span>}</div></td><td className="px-5 py-4 text-center hidden sm:table-cell"><span className="font-medium">{t.courses?.length || 0}</span></td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><button onClick={() => handleStatusToggle(t._id, t.status)} className="cursor-pointer" title="Click to toggle"><StatusBadge status={t.status} /></button></td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><ThreeDotsMenu teacher={t} onEdit={() => setEditingTeacher(t)} onDelete={() => handleDelete(t._id, `${t.profile?.firstName} ${t.profile?.lastName}`)} /></td></tr>))}</tbody></table></div></div></>)}

        {showCreate && <TeacherModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchTeachers(); }} />}
        {editingTeacher && <TeacherModal teacher={editingTeacher} onClose={() => setEditingTeacher(undefined)} onSaved={() => { setEditingTeacher(undefined); fetchTeachers(); }} />}
        {viewingTeacher && <ViewModal teacher={viewingTeacher} onClose={() => setViewingTeacher(undefined)} />}
      </div>
    </div>
  );
}

export default TeachersManage;