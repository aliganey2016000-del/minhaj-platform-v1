import { useEffect, useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

type Action = 'read' | 'create' | 'edit' | 'delete' | 'export' | 'import';
type Permission = { module: string; actions: Action[] };
type CatalogItem = { module: string; label: string; description: string; actions: Action[] };
type StaffUser = { _id: string; email: string; permissions?: Permission[]; profile?: { firstName?: string; lastName?: string } | null };

const actionLabels: Record<Action, string> = {
  read: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', export: 'Export', import: 'Import',
};

export function RolesManage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [usersResponse, catalogResponse] = await Promise.all([
          api.get('/users', { params: { role: 'staff', limit: 100 } }),
          api.get('/users/permissions/catalog'),
        ]);
        setStaff(usersResponse.data.data || []);
        setCatalog(catalogResponse.data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load Staff permissions');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectStaff = (id: string) => {
    setSelectedId(id);
    const selected = staff.find((member) => member._id === id);
    setPermissions(selected?.permissions || []);
    setMessage('');
  };

  const actionsFor = (module: string) => permissions.find((permission) => permission.module === module)?.actions || [];
  const isEnabled = (module: string) => actionsFor(module).length > 0;

  const toggleAction = (module: string, action: Action) => {
    setPermissions((current) => {
      const existing = current.find((permission) => permission.module === module);
      const actions = existing?.actions || [];
      const nextActions = actions.includes(action) ? actions.filter((item) => item !== action) : [...actions, action];
      return nextActions.length
        ? [...current.filter((permission) => permission.module !== module), { module, actions: nextActions }]
        : current.filter((permission) => permission.module !== module);
    });
  };

  const toggleModule = (item: CatalogItem) => {
    const enabled = isEnabled(item.module);
    setPermissions((current) => enabled
      ? current.filter((permission) => permission.module !== item.module)
      : [...current, { module: item.module, actions: ['read'] }]);
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.patch(`/users/${selectedId}/permissions`, { permissions });
      setStaff((current) => current.map((member) => member._id === selectedId ? { ...member, permissions } : member));
      setMessage('Permissions saved successfully. The Staff member will receive them on the next login or token refresh.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save permissions');
    } finally { setSaving(false); }
  };

  if (user?.role !== 'admin' && user?.role !== 'org_admin') return null;

  return (
    <div className="p-6 pt-20 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-primary-600" /><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Staff permissions</h1></div>
            <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Choose a Staff member, allow a module, then choose the actions available inside it.</p>
          </div>
          <button onClick={save} disabled={!selectedId || saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving...' : 'Save permissions'}</button>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Staff member</label>
          <select value={selectedId} onChange={(event) => selectStaff(event.target.value)} disabled={loading} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm">
            <option value="">{loading ? 'Loading Staff...' : 'Select a Staff member...'}</option>
            {staff.map((member) => <option key={member._id} value={member._id}>{member.profile ? `${member.profile.firstName || ''} ${member.profile.lastName || ''}`.trim() : member.email} · {member.email}</option>)}
          </select>
          {!loading && staff.length === 0 && <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">Create a user with the Staff role first.</p>}
        </div>

        {selectedId && <div className="grid gap-4 md:grid-cols-2">
          {catalog.map((item) => {
            const enabled = isEnabled(item.module);
            return <section key={item.module} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="font-semibold text-[var(--color-text-primary)]">{item.label}</h2><p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{item.description}</p></div>
                <button type="button" role="switch" aria-checked={enabled} onClick={() => toggleModule(item)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
              </div>
              <div className={`mt-4 grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] pt-4 ${enabled ? '' : 'opacity-40'}`}>
                {item.actions.map((action) => { const checked = actionsFor(item.module).includes(action); return <label key={action} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-secondary)]"><input type="checkbox" checked={checked} disabled={!enabled} onChange={() => toggleAction(item.module, action)} className="sr-only" /><span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{checked && <Check className="h-3.5 w-3.5" />}</span>{actionLabels[action]}</label>; })}
              </div>
            </section>;
          })}
        </div>}
      </div>
    </div>
  );
}

export default RolesManage;
