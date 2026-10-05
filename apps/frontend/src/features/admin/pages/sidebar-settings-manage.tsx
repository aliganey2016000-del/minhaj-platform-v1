import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

type PortalTab = 'student' | 'teacher' | 'staff';
type PermissionAction = 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'publish' | 'print' | 'export' | 'import' | 'receive_payment' | 'submit' | 'enter_results';
type Permission = { module: string; page?: string; actions: PermissionAction[] };
type SidebarItem = { key: string; label: string; section: string; visible: boolean };
type CatalogItem = { key: string; label: string; section: string; module: string | null; allowedActions?: PermissionAction[] };
type SchoolBrief = { _id: string; name: string };
type StaffUser = {
  _id: string; email: string; title?: string; isActive?: boolean;
  profile?: { firstName?: string; lastName?: string } | null;
  permissions?: Permission[]; sidebarAccess?: string[];
};

const ACTION_LABELS: Record<PermissionAction, string> = {
  read: 'View', create: 'Create', edit: 'Edit', delete: 'Delete',
  approve: 'Approve', publish: 'Publish', print: 'Print', export: 'Export',
  import: 'Import', receive_payment: 'Receive Payment', submit: 'Submit',
  enter_results: 'Enter Results',
};

const SECTION_ORDER = [
  'INSTITUTION MANAGEMENT', 'ACADEMIC MANAGEMENT', 'EXAM MANAGEMENT',
  'FINANCE MANAGEMENT', 'COMMUNICATION', 'CONTENT', 'HR MANAGEMENT',
  'REPORTS', 'SYSTEM',
];

function staffSection(item: CatalogItem): string {
  const key = item.key;
  if (key.startsWith('admin/hr') || key === 'admin/staff') return 'HR MANAGEMENT';
  if (key.includes('/reports') || key.includes('analytics?tab=overview') || key === 'admin/logs') return 'REPORTS';
  if (item.module === 'exams') return 'EXAM MANAGEMENT';
  if (item.module === 'finance') return 'FINANCE MANAGEMENT';
  if (item.module === 'communication') return 'COMMUNICATION';
  if (item.module === 'content') return 'CONTENT';
  if (item.module === 'system') return 'SYSTEM';
  if (item.module === 'courses' || item.module === 'academic') return 'ACADEMIC MANAGEMENT';
  return 'INSTITUTION MANAGEMENT';
}

function nameOf(member: StaffUser | null): string {
  if (!member) return '';
  const full = `${member.profile?.firstName || ''} ${member.profile?.lastName || ''}`.trim();
  return full || member.email;
}

export function SidebarSettingsManage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<PortalTab>('student');

  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [schoolsLoading, setSchoolsLoading] = useState(isSuperAdmin);

  const [items, setItems] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(SECTION_ORDER.map((s) => [s, true])));

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const { data } = await api.get('/schools');
        setSchools(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load organizations');
      } finally {
        setSchoolsLoading(false);
      }
    })();
  }, [isSuperAdmin]);

  const targetReady = !isSuperAdmin || !!selectedSchool;
  const schoolParams = useMemo(() => isSuperAdmin && selectedSchool ? { school: selectedSchool } : {}, [isSuperAdmin, selectedSchool]);

  const fetchPortal = useCallback(async (portal: 'student' | 'teacher') => {
    if (!targetReady) { setItems([]); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      const { data } = await api.get('/sidebar-settings', { params: { ...schoolParams, portal } });
      setItems(data.data?.items || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load sidebar settings');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [schoolParams, targetReady]);

  const fetchStaff = useCallback(async () => {
    if (!targetReady) { setStaff([]); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      const [usersRes, catalogRes] = await Promise.all([
        api.get('/users', { params: { role: 'staff', limit: 100, ...schoolParams } }),
        api.get('/users/sidebar/catalog'),
      ]);
      setStaff(usersRes.data.data || []);
      setCatalog(catalogRes.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load staff access data');
      setStaff([]); setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [schoolParams, targetReady]);

  useEffect(() => {
    setMessage(''); setError(''); setSelectedStaffId(''); setSelectedStaff(null); setSelectedKeys([]); setPermissions([]);
    if (tab === 'student' || tab === 'teacher') void fetchPortal(tab);
    else void fetchStaff();
  }, [tab, selectedSchool, fetchPortal, fetchStaff]);

  const groupedPortal = useMemo(() => items.reduce<Record<string, SidebarItem[]>>((acc, item) => {
    (acc[item.section] ||= []).push(item); return acc;
  }, {}), [items]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((member) => `${nameOf(member)} ${member.email} ${member.title || ''}`.toLowerCase().includes(q));
  }, [staff, staffSearch]);

  const groupedCatalog = useMemo(() => {
    const groups: Record<string, CatalogItem[]> = {};
    catalog.forEach((item) => {
      if (!item.module) return;
      (groups[staffSection(item)] ||= []).push(item);
    });
    return groups;
  }, [catalog]);

  const selectStaff = async (id: string) => {
    setSelectedStaffId(id); setSelectedStaff(null); setSelectedKeys([]); setPermissions([]); setMessage(''); setError('');
    if (!id) return;
    try {
      const { data } = await api.get(`/users/${id}`);
      const member = data.data as StaffUser;
      setSelectedStaff(member);
      setSelectedKeys(member.sidebarAccess || []);
      setPermissions((member.permissions || []) as Permission[]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load selected staff member');
    }
  };

  const togglePortalItem = (key: string) => setItems((prev) => prev.map((item) => item.key === key ? { ...item, visible: !item.visible } : item));

  const savePortal = async () => {
    if (tab !== 'student' && tab !== 'teacher') return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.put('/sidebar-settings', {
        ...schoolParams, portal: tab,
        items: items.map(({ key, visible }) => ({ key, visible })),
      });
      setMessage(`${tab === 'student' ? 'Student' : 'Teacher'} Sidebar settings saved.`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save sidebar settings');
    } finally { setSaving(false); }
  };

  const actionsFor = (page: CatalogItem): PermissionAction[] =>
    permissions.find((permission) => permission.page === page.key)?.actions || [];

  const setPage = (page: CatalogItem, enabled: boolean) => {
    setSelectedKeys((current) => enabled ? Array.from(new Set([...current, page.key])) : current.filter((key) => key !== page.key));
    setPermissions((current) => {
      if (!enabled) return current.filter((permission) => permission.page !== page.key);
      if (current.some((permission) => permission.page === page.key)) return current;
      const defaultAction = page.allowedActions?.includes('read') ? 'read' : page.allowedActions?.[0];
      return defaultAction && page.module ? [...current, { module: page.module, page: page.key, actions: [defaultAction] }] : current;
    });
  };

  const toggleAction = (page: CatalogItem, action: PermissionAction) => {
    if (!page.module) return;
    setSelectedKeys((current) => current.includes(page.key) ? current : [...current, page.key]);
    setPermissions((current) => {
      const existing = current.find((permission) => permission.page === page.key);
      const nextActions = existing?.actions.includes(action)
        ? existing.actions.filter((item) => item !== action)
        : [...(existing?.actions || []), action];
      const rest = current.filter((permission) => permission.page !== page.key);
      return nextActions.length ? [...rest, { module: page.module!, page: page.key, actions: nextActions }] : rest;
    });
  };

  const selectAll = () => {
    const selectable = catalog.filter((item) => item.module);
    setSelectedKeys(selectable.map((item) => item.key));
    setPermissions(selectable.flatMap((item) => {
      const action = item.allowedActions?.includes('read') ? 'read' : item.allowedActions?.[0];
      return action && item.module ? [{ module: item.module, page: item.key, actions: [action] as PermissionAction[] }] : [];
    }));
  };
  const clearAll = () => { setSelectedKeys([]); setPermissions([]); };

  const saveStaff = async () => {
    if (!selectedStaffId) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const pagePermissions = permissions.filter((permission) => permission.page && selectedKeys.includes(permission.page));
      await Promise.all([
        api.patch(`/users/${selectedStaffId}/sidebar-access`, { keys: selectedKeys }),
        api.patch(`/users/${selectedStaffId}/permissions`, { permissions: pagePermissions }),
      ]);
      setMessage('Staff/Admin access saved. Sidebar visibility and API permissions are now aligned.');
      await selectStaff(selectedStaffId);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save staff permissions');
    } finally { setSaving(false); }
  };

  const permissionSummary = useMemo(() => {
    const counts = new Map<string, number>();
    permissions.forEach((permission) => counts.set(permission.module, (counts.get(permission.module) || 0) + permission.actions.length));
    return counts;
  }, [permissions]);

  return (
    <div className="p-4 pt-20 sm:p-6 lg:p-10 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">Tenant Sidebar Config</h1>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Tenant-scoped portal visibility and real Staff/Admin authorization.</p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-1">
          {([
            ['student', 'Student Sidebar'],
            ['teacher', 'Teacher Sidebar'],
            ['staff', 'Staff/Admin Access'],
          ] as Array<[PortalTab, string]>).map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${tab === value ? 'bg-[var(--color-surface-primary)] text-primary-700 shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}>
              {label}
            </button>
          ))}
        </div>

        {isSuperAdmin && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:p-5">
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Organization *</label>
            {schoolsLoading ? <p className="text-sm text-[var(--color-text-tertiary)]">Loading organizations...</p> : (
              <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">
                <option value="">Select an organization...</option>
                {schools.map((school) => <option key={school._id} value={school._id}>{school.name}</option>)}
              </select>
            )}
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Every change is saved only for the selected tenant. There is no global sidebar configuration.</p>
          </div>
        )}

        {message && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:bg-green-950/30">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30">{error}</div>}
        {loading && <div className="flex justify-center py-12"><div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!loading && !targetReady && <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">Select an organization to continue.</div>}

        {!loading && targetReady && (tab === 'student' || tab === 'teacher') && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-bold">{tab === 'student' ? 'Student Sidebar Manager' : 'Teacher Sidebar Manager'}</h2><p className="text-sm text-[var(--color-text-tertiary)]">{tab === 'teacher' ? 'Enable or disable teacher navigation and direct page access for this tenant.' : 'Enable or disable navigation items for this tenant.'}</p></div>
              <button onClick={savePortal} disabled={saving || !items.length} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(groupedPortal).map(([section, sectionItems]) => (
                <section key={section} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{section}</p>
                  <div className="space-y-1">
                    {sectionItems.map((item) => <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-[var(--color-surface-secondary)]">
                      <span className="text-sm font-medium">{item.label}</span>
                      <button type="button" role="switch" aria-checked={item.visible} onClick={() => togglePortalItem(item.key)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${item.visible ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-700'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${item.visible ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                    </div>)}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        {!loading && targetReady && tab === 'staff' && (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div>
                <label className="mb-1 block text-xs font-semibold">Search Staff</label>
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" /><input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Search by name/email" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-9 pr-3 text-sm" /></div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Select Staff</label>
                <select value={selectedStaffId} onChange={(e) => void selectStaff(e.target.value)} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm">
                  <option value="">Select staff member...</option>
                  {filteredStaff.map((member) => <option key={member._id} value={member._id}>{nameOf(member)} — {member.email}</option>)}
                </select>
              </div>
            </div>

            {selectedStaff && <>
              <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700"><UserRound className="h-5 w-5" /></div><div className="min-w-0"><p className="truncate font-semibold">{nameOf(selectedStaff)}</p><p className="truncate text-xs text-[var(--color-text-tertiary)]">{selectedStaff.title || 'Staff'} · {selectedStaff.email}</p></div></div>
                <div className="flex flex-wrap gap-2">
                  {['exams','finance','admissions','organization'].map((module) => <span key={module} className="rounded-full bg-[var(--color-surface-secondary)] px-3 py-1 text-xs"><span className="capitalize">{module}</span> · {permissionSummary.get(module) ? `${permissionSummary.get(module)} permissions` : 'No access'}</span>)}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2"><button onClick={selectAll} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-sm font-medium">Select All</button><button onClick={clearAll} className="rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-sm font-medium">Clear All</button></div>
                <button onClick={saveStaff} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{saving ? 'Saving...' : 'Save Permissions'}</button>
              </div>

              <div className="space-y-3">
                {SECTION_ORDER.map((section) => {
                  const sectionItems = groupedCatalog[section] || [];
                  if (!sectionItems.length) return null;
                  const open = expanded[section] !== false;
                  return <section key={section} className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
                    <button onClick={() => setExpanded((state) => ({ ...state, [section]: !open }))} className="flex w-full items-center gap-2 px-4 py-3 text-left"><span className="flex-1 text-xs font-bold uppercase tracking-widest">{section}</span>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                    {open && <div className="grid gap-3 border-t border-[var(--color-border-subtle)] p-3 md:grid-cols-2">
                      {sectionItems.map((page) => {
                        const checked = selectedKeys.includes(page.key);
                        const granted = actionsFor(page);
                        return <div key={page.key} className={`rounded-xl border p-3 ${checked ? 'border-primary-300 bg-primary-50/40 dark:bg-primary-950/20' : 'border-[var(--color-border-default)]'}`}>
                          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={checked} onChange={(e) => setPage(page, e.target.checked)} /><span className="text-sm font-semibold">{page.label}</span></label>
                          {checked && <div className="mt-3 flex flex-wrap gap-2">{(page.allowedActions || []).map((action) => <label key={action} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs ${granted.includes(action) ? 'border-primary-300 bg-primary-100 text-primary-800 dark:bg-primary-950/40' : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)]'}`}><input type="checkbox" className="sr-only" checked={granted.includes(action)} onChange={() => toggleAction(page, action)} />{ACTION_LABELS[action]}</label>)}</div>}
                        </div>;
                      })}
                    </div>}
                  </section>;
                })}
              </div>
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

export default SidebarSettingsManage;
