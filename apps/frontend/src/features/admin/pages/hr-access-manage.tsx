import { useEffect, useState } from 'react';
import { Search, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';

type Staff = { _id: string; email: string; isActive?: boolean; title?: string; profile?: { firstName?: string; lastName?: string } | null };

export function HrAccessManage() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/users', { params: { role: 'staff', limit: 100 } });
        setStaff(data.data || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load staff');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = staff.filter((member) => {
    const name = `${member.profile?.firstName || ''} ${member.profile?.lastName || ''}`.trim();
    return `${name} ${member.email} ${member.title || ''}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">HR Management</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">Access & Permissions</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Select a staff member to manage portal pages and actions.</p>
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..." className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary-500/30" />
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
        {loading ? <div className="p-6 text-sm text-[var(--color-text-secondary)]">Loading staff...</div> : filtered.length === 0 ? <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">No staff members found.</div> : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {filtered.map((member) => {
              const name = `${member.profile?.firstName || ''} ${member.profile?.lastName || ''}`.trim() || member.email;
              return <div key={member._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]"><UserRound className="h-5 w-5" /></div>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{name}</p><p className="truncate text-xs text-[var(--color-text-secondary)]">{member.title || 'Staff'} · {member.email}</p></div>
                </div>
                <button onClick={() => navigate(`/admin/staff/${member._id}/access`)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-default)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]"><ShieldCheck className="h-4 w-4" /> Manage access</button>
              </div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
