import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface LogEntry {
  _id: string;
  user?: { _id: string; email: string; role: string };
  action: string;
  resource: string;
  resourceId: string;
  details: string;
  ip: string;
  createdAt: string;
}

const actionIcons: Record<string, string> = { create: '➕', update: '✏️', delete: '🗑️', login: '🔑', logout: '🚪', view: '👁️', export: '📥' };
const actionColors: Record<string, string> = { create: 'text-green-600', update: 'text-blue-600', delete: 'text-red-600', login: 'text-purple-600', logout: 'text-gray-600', view: 'text-cyan-600', export: 'text-amber-600' };

export function ActivityLogsManage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: '30' };
      if (search) params.search = search;
      if (actionFilter) params.action = actionFilter;
      const { data } = await api.get('/system/logs', { params });
      setLogs(data.data || []); setTotal(data.meta?.total || 0);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  }, [page, search, actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleClear = async () => {
    if (!window.confirm('Clear ALL activity logs? This cannot be undone.')) return;
    try {
      await api.delete('/system/logs');
      setMessage('✅ All logs cleared!');
      fetchLogs();
    } catch (err: any) { alert(err.response?.data?.message || 'Failed'); }
  };

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📋 Activity Logs</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} entries</p></div>
          <button onClick={handleClear} className="rounded-xl border border-red-300 px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">🗑️ Clear All</button>
        </div>
        {message && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" placeholder="Search logs..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="flex-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" />
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm">
            <option value="">All Actions</option>
            {['create','update','delete','login','logout','view','export'].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">{error}</div>}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>}
        {!loading && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-secondary)] border-b"><tr><th className="text-left px-5 py-3 font-semibold">Action</th><th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">User</th><th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Resource</th><th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Details</th><th className="text-left px-5 py-3 font-semibold">Time</th></tr></thead>
              <tbody>
                {logs.length === 0 ? <tr><td colSpan={5} className="text-center py-16 text-[var(--color-text-tertiary)]">No activity logs yet.</td></tr> :
                  logs.map(l => (
                    <tr key={l._id} className="border-b hover:bg-[var(--color-surface-secondary)]">
                      <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 font-medium ${actionColors[l.action] || ''}`}>{actionIcons[l.action] || '📌'} {l.action}</span></td>
                      <td className="px-5 py-4 hidden sm:table-cell text-xs">{l.user?.email || '—'}<br /><span className="text-[var(--color-text-tertiary)] capitalize">{l.user?.role || ''}</span></td>
                      <td className="px-5 py-4 hidden md:table-cell text-xs">{l.resource}{l.resourceId ? ` #${l.resourceId}` : ''}</td>
                      <td className="px-5 py-4 hidden lg:table-cell text-xs text-[var(--color-text-tertiary)]">{l.details || '—'}</td>
                      <td className="px-5 py-4 text-xs text-[var(--color-text-tertiary)]">{new Date(l.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
            {totalPages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t bg-[var(--color-surface-secondary)]"><p className="text-xs">{total} entries</p><div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">← Prev</button><span className="text-xs">Page {page} of {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">Next →</button></div></div>}
          </div>
        )}
      </div>
    </div>
  );
}
export default ActivityLogsManage;