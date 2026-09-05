import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Save, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../lib/axios';

type Action = 'read' | 'create' | 'edit' | 'delete' | 'export' | 'import';
type SidebarItem = { key: string; label: string; section: string; module: string | null };
type StaffUser = { email: string; profile?: { firstName?: string; lastName?: string } | null };
type Permission = { module: string; page?: string; actions: Action[] };

const actionLabels: Record<Action, string> = { read: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', export: 'Export', import: 'Import' };
const actions: Action[] = ['read', 'create', 'edit', 'delete', 'export', 'import'];

export function StaffAccessManage() {
  const navigate = useNavigate();
  const { staffId } = useParams<{ staffId: string }>();
  const [items, setItems] = useState<SidebarItem[]>([]);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!staffId) return;
    (async () => {
      try {
        const [sidebarResponse, userResponse] = await Promise.all([
          api.get('/users/sidebar/catalog'),
          api.get(`/users/${staffId}`),
        ]);
        setItems(sidebarResponse.data.data || []);
        setStaff(userResponse.data.data || null);
        setSelected(userResponse.data.data?.sidebarAccess || []);
        setPermissions(userResponse.data.data?.permissions || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load Staff access');
      } finally {
        setLoading(false);
      }
    })();
  }, [staffId]);

  const grouped = useMemo(() => items.reduce<Record<string, SidebarItem[]>>((groups, item) => {
    (groups[item.section] ||= []).push(item);
    return groups;
  }, {}), [items]);

  const togglePage = (key: string) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const toggleSection = (sectionItems: SidebarItem[]) => {
    const keys = sectionItems.map((item) => item.key);
    const allSelected = keys.every((key) => selected.includes(key));
    setSelected((current) => allSelected ? current.filter((key) => !keys.includes(key)) : Array.from(new Set([...current, ...keys])));
  };
  const actionsFor = (page: SidebarItem) => permissions.find((permission) => permission.page === page.key || (!permission.page && permission.module === page.module))?.actions || [];
  const toggleAction = (page: SidebarItem, action: Action) => setPermissions((current) => {
    if (!page.module) return current;
    const existing = current.find((permission) => permission.page === page.key);
    const nextActions = existing?.actions.includes(action) ? existing.actions.filter((item) => item !== action) : [...(existing?.actions || []), action];
    const remaining = current.filter((permission) => permission.page !== page.key);
    return nextActions.length ? [...remaining, { module: page.module, page: page.key, actions: nextActions }] : remaining;
  });

  const save = async () => {
    if (!staffId) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const pagePermissions = items
        .filter((item) => item.module && selected.includes(item.key))
        .map((item) => ({ module: item.module!, page: item.key, actions: actionsFor(item) }))
        .filter((permission) => permission.actions.length);
      await api.patch(`/users/${staffId}/sidebar-access`, { keys: selected });
      await api.patch(`/users/${staffId}/permissions`, { permissions: pagePermissions });
      setMessage('Page access and page actions saved successfully. They apply on the next login or refresh.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save Staff access');
    } finally {
      setSaving(false);
    }
  };

  const name = staff?.profile ? `${staff.profile.firstName || ''} ${staff.profile.lastName || ''}`.trim() : '';
  return <div className="p-6 pt-20 lg:p-10 lg:pt-10"><div className="mx-auto max-w-5xl space-y-6">
    <div className="flex items-start justify-between gap-4"><div><button onClick={() => navigate('/admin/staff')} className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--color-text-tertiary)] hover:text-primary-600"><ArrowLeft className="h-4 w-4" /> Back to Staff</button><div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-primary-600" /><div><h1 className="text-2xl font-bold sm:text-3xl">Allowed pages</h1><p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{name || staff?.email || 'Staff member'} · choose a page and its actions.</p></div></div></div><button onClick={save} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save access'}</button></div>
    {message && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}{error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading ? <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">Loading pages...</div> : <div className="space-y-6">{Object.entries(grouped).map(([section, sectionItems]) => { const allSelected = sectionItems.every((item) => selected.includes(item.key)); return <section key={section}><div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{section}</h2><button onClick={() => toggleSection(sectionItems)} className="text-xs font-medium text-primary-600 hover:underline">{allSelected ? 'Uncheck all' : 'Check all'}</button></div><div className="grid gap-4 md:grid-cols-2">{sectionItems.map((item) => { const checked = selected.includes(item.key); const pageActions = actionsFor(item); return <div key={item.key} className={`rounded-2xl border p-4 transition-colors ${checked ? 'border-primary-300 bg-primary-50/50' : 'border-[var(--color-border-default)] bg-[var(--color-surface-primary)]'}`}><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={checked} onChange={() => togglePage(item.key)} className="sr-only" /><span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300'}`}>{checked && <Check className="h-3.5 w-3.5" />}</span><span className="text-sm font-semibold">{item.label}</span></label>{item.module && <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--color-border-subtle)] pt-3 sm:grid-cols-3">{actions.map((action) => <label key={action} className={`flex items-center gap-2 text-xs ${checked ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-tertiary)]'}`}><input type="checkbox" checked={pageActions.includes(action)} disabled={!checked} onChange={() => toggleAction(item, action)} className="rounded border-[var(--color-border-default)]" />{actionLabels[action]}</label>)}</div>}</div>; })}</div></section>; })}</div>}
  </div></div>;
}

export default StaffAccessManage;
