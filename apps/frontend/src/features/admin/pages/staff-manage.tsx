import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDown, FileUp, MoreVertical, Pencil, Plus, Search, UserRound, UserRoundX } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { Pagination } from '../components/pagination';

interface StaffMember {
  _id: string;
  email: string;
  phone?: string;
  isActive: boolean;
  organizationId?: { _id: string; name: string } | null;
  profile?: { firstName?: string; lastName?: string; gender?: string } | null;
}

interface StaffForm {
  firstName: string;
  lastName: string;
  gender: string;
  email: string;
  phone: string;
  password: string;
  organizationId: string;
}

const emptyForm: StaffForm = { firstName: '', lastName: '', gender: 'male', email: '', phone: '', password: '', organizationId: '' };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function StaffModal({ member, isSuperAdmin, onClose, onSaved }: { member?: StaffMember; isSuperAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(member);
  const [form, setForm] = useState<StaffForm>(member ? {
    firstName: member.profile?.firstName || '', lastName: member.profile?.lastName || '',
    gender: member.profile?.gender || 'male', email: member.email, phone: member.phone || '', password: '', organizationId: member.organizationId?._id || '',
  } : emptyForm);
  const [schools, setSchools] = useState<{ _id: string; name: string; status: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (isSuperAdmin) api.get('/schools', { params: { limit: 100 } }).then(({ data }) => setSchools(data.data || [])).catch(() => undefined); }, [isSuperAdmin]);
  const update = (field: keyof StaffForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (editing) {
        await api.patch(`/users/${member!._id}`, { email: form.email, firstName: form.firstName, lastName: form.lastName, gender: form.gender, ...(form.phone ? { phone: form.phone } : {}) });
      } else {
        await api.post('/users', { ...form, role: 'staff', organizationId: form.organizationId || undefined });
      }
      onClose();
      void onSaved();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save Staff member'); }
    finally { setSaving(false); }
  };

  const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)]';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-lg rounded-2xl bg-[var(--color-surface-primary)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">{editing ? 'Edit Staff member' : 'Add Staff member'}</h2><button onClick={onClose} className="text-2xl text-[var(--color-text-tertiary)]">&times;</button></div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3"><input className={input} placeholder="First name *" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required /><input className={input} placeholder="Last name *" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3"><select className={input} value={form.gender} onChange={(e) => update('gender', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select><input className={input} placeholder="Phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
        {isSuperAdmin && <select className={input} value={form.organizationId} onChange={(e) => update('organizationId', e.target.value)} required><option value="">Select organization *</option>{schools.filter((school) => school.status === 'active').map((school) => <option key={school._id} value={school._id}>{school.name}</option>)}</select>}
        <input className={input} type="email" placeholder="Email *" value={form.email} onChange={(e) => update('email', e.target.value)} required />
        {!editing && <input className={input} type="password" placeholder="Password * (minimum 8 characters)" value={form.password} onChange={(e) => update('password', e.target.value)} minLength={8} required />}
        <div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm">Cancel</button><button disabled={saving} className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving...' : editing ? 'Update' : 'Create Staff'}</button></div>
      </form>
    </div>
  </div>;
}

export function StaffManage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StaffMember>();
  const [menuId, setMenuId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchStaff = useCallback(async (nextPage = page) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/users', { params: { role: 'staff', page: nextPage, limit: 10, status: status || undefined, search: search || undefined } });
      setStaff(data.data || []); setTotal(data.meta?.total || 0); setPage(nextPage);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load Staff'); }
    finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { fetchStaff(1); }, [status]);

  const exportStaff = async () => { try { const response = await api.get('/users/staff/export', { responseType: 'blob' }); downloadBlob(response.data, `staff-export-${new Date().toISOString().slice(0, 10)}.xlsx`); } catch { setError('Failed to export Staff'); } };
  const downloadTemplate = async () => { try { const response = await api.get('/users/staff/template', { responseType: 'blob' }); downloadBlob(response.data, 'staff-template.xlsx'); } catch { setError('Failed to download template'); } };
  const importStaff = async (file: File) => {
    const formData = new FormData(); formData.append('file', file);
    try { const { data } = await api.post('/users/staff/import', formData); setMessage(`${data.data?.created || 0} Staff member(s) imported`); fetchStaff(1); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to import Staff'); }
  };
  const deactivate = async (member: StaffMember) => {
    if (!window.confirm(`Deactivate ${member.profile?.firstName || member.email}?`)) return;
    try { await api.delete(`/users/${member._id}`); setMessage('Staff member deactivated'); fetchStaff(page); } catch (err: any) { setError(err.response?.data?.message || 'Failed to deactivate Staff'); }
  };

  return <div className="p-6 pt-20 lg:p-10 lg:pt-10">
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-3"><UserRound className="h-8 w-8 text-primary-600" /><h1 className="text-3xl font-bold">Manage Staff</h1></div><p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Create and manage the staff members of {user?.organizationName || 'your organization'}.</p></div><button onClick={() => { setEditing(undefined); setShowModal(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add Staff</button></div>
      {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 lg:flex-row lg:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent py-2.5 pl-9 pr-3 text-sm" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchStaff(1)} /></div><select className="rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="">All statuses</option></select><button onClick={() => fetchStaff(1)} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm">Search</button><div className="flex gap-2"><button onClick={downloadTemplate} title="Download template" className="rounded-xl border border-[var(--color-border-default)] p-2.5"><FileDown className="h-4 w-4" /></button><button onClick={() => fileRef.current?.click()} title="Import Staff" className="rounded-xl border border-[var(--color-border-default)] p-2.5"><FileUp className="h-4 w-4" /></button><button onClick={exportStaff} title="Export Staff" className="rounded-xl border border-[var(--color-border-default)] p-2.5"><FileDown className="h-4 w-4 text-primary-600" /></button><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importStaff(file); e.currentTarget.value = ''; }} /></div></div>
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]"><tr><th className="px-5 py-3 font-semibold">Staff member</th><th className="px-5 py-3 font-semibold">Email</th><th className="px-5 py-3 font-semibold">Phone</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{loading ? <tr><td colSpan={5} className="px-5 py-12 text-center text-[var(--color-text-tertiary)]">Loading Staff...</td></tr> : staff.length === 0 ? <tr><td colSpan={5} className="px-5 py-12 text-center text-[var(--color-text-tertiary)]">No Staff members found.</td></tr> : staff.map((member) => <tr key={member._id} className="hover:bg-[var(--color-surface-secondary)]"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-700"><UserRound className="h-4 w-4" /></div><span className="font-semibold">{`${member.profile?.firstName || ''} ${member.profile?.lastName || ''}`.trim() || 'Unnamed Staff'}</span></div></td><td className="px-5 py-4 text-[var(--color-text-secondary)]">{member.email}</td><td className="px-5 py-4 text-[var(--color-text-secondary)]">{member.phone || '—'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${member.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{member.isActive ? 'Active' : 'Inactive'}</span></td><td className="relative px-5 py-4 text-right"><button onClick={() => setMenuId(menuId === member._id ? null : member._id)} className="rounded-lg p-2 hover:bg-[var(--color-surface-tertiary)]"><MoreVertical className="h-4 w-4" /></button>{menuId === member._id && <div className="absolute right-5 top-12 z-10 w-40 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-1 text-left shadow-xl"><button onClick={() => { setEditing(member); setShowModal(true); setMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-3.5 w-3.5" /> Edit</button>{member.isActive && <button onClick={() => { deactivate(member); setMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"><UserRoundX className="h-3.5 w-3.5" /> Deactivate</button>}</div>}</td></tr>)}</tbody></table></div><div className="border-t border-[var(--color-border-default)] px-5 py-3"><Pagination page={page} total={total} limit={10} onPageChange={fetchStaff} /></div></div>
    </div>
    {showModal && <StaffModal member={editing} isSuperAdmin={isSuperAdmin} onClose={() => setShowModal(false)} onSaved={() => fetchStaff(page)} />}
  </div>;
}

export default StaffManage;
