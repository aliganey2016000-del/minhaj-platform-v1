/**
 * Trash — app-wide soft-delete recovery. Anything deleted from Manage
 * Parents, Teachers, Classes, Courses, or Organization Management lands
 * here instead of being gone immediately; it can be restored or
 * permanently purged.
 */
import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface TrashItem {
  _id: string;
  entityType: 'Parent' | 'Teacher' | 'Class' | 'Course' | 'School';
  label: string;
  school?: { _id: string; name: string } | null;
  deletedBy?: { _id: string; email: string } | null;
  deletedAt: string;
}

const ENTITY_TYPES: TrashItem['entityType'][] = ['Parent', 'Teacher', 'Class', 'Course', 'School'];

const TYPE_STYLES: Record<string, string> = {
  Parent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Course: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  School: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export function TrashManage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'admin';

  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const limit = 20;

  const fetchItems = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: String(limit) };
      if (entityType) params.entityType = entityType;
      const { data } = await api.get('/trash', { params });
      setItems(data.data || []); setTotal(data.meta?.total || 0);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load trash'); }
    finally { setLoading(false); }
  }, [page, entityType]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item._id); setMessage(''); setError('');
    try {
      await api.post(`/trash/${item._id}/restore`);
      setMessage(`✅ "${item.label}" restored successfully`);
      setItems(prev => prev.filter(i => i._id !== item._id));
      setTotal(t => Math.max(0, t - 1));
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to restore'); }
    finally { setBusyId(null); }
  };

  const handlePurge = async (item: TrashItem) => {
    if (!window.confirm(`Permanently delete "${item.label}"? This cannot be undone.`)) return;
    setBusyId(item._id); setMessage(''); setError('');
    try {
      await api.delete(`/trash/${item._id}`);
      setMessage(`🗑️ "${item.label}" permanently deleted`);
      setItems(prev => prev.filter(i => i._id !== item._id));
      setTotal(t => Math.max(0, t - 1));
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete'); }
    finally { setBusyId(null); }
  };

  const handleEmpty = async () => {
    if (!window.confirm(`Permanently delete all ${total} item(s) in Trash? This cannot be undone.`)) return;
    setEmptying(true); setMessage(''); setError('');
    try {
      const { data } = await api.delete('/trash');
      setMessage(`🗑️ Permanently deleted ${data.data?.deleted ?? 0} item(s)`);
      setPage(1); fetchItems();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to empty trash'); }
    finally { setEmptying(false); }
  };

  const totalPages = Math.ceil(total / limit);
  const canActOn = (item: TrashItem) => item.entityType !== 'School' || isSuperAdmin;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🗑️ Trash</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} deleted item{total === 1 ? '' : 's'} — restore or permanently delete</p>
          </div>
          <button
            onClick={handleEmpty}
            disabled={emptying || total === 0}
            className="rounded-xl border border-red-300 dark:border-red-800 px-5 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {emptying ? 'Emptying...' : '🗑️ Empty Trash'}
          </button>
        </div>

        {message && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-400 flex items-center justify-between">
            <span>{message}</span><button onClick={() => setMessage('')} className="text-xs underline">Dismiss</button>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600 dark:text-red-400 flex items-center justify-between">
            <span>{error}</span><button onClick={() => setError('')} className="text-xs underline">Dismiss</button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">All Types</option>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!loading && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Type</th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Name</th>
                    <th className="text-left px-5 py-3 font-semibold hidden md:table-cell whitespace-nowrap">Organization</th>
                    <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell whitespace-nowrap">Deleted By</th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Deleted At</th>
                    <th className="text-center px-5 py-3 font-semibold whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">🗑️ Trash is empty</p><p className="text-sm">Deleted parents, teachers, classes, courses, and organizations will show up here.</p></td></tr>
                  ) : items.map(item => (
                    <tr key={item._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[item.entityType] || 'bg-gray-100 text-gray-600'}`}>{item.entityType}</span></td>
                      <td className="px-5 py-4 whitespace-nowrap font-medium text-[var(--color-text-primary)]">{item.label}</td>
                      <td className="px-5 py-4 hidden md:table-cell whitespace-nowrap text-[var(--color-text-secondary)]">{item.school?.name || '—'}</td>
                      <td className="px-5 py-4 hidden sm:table-cell whitespace-nowrap text-xs text-[var(--color-text-tertiary)]">{item.deletedBy?.email || '—'}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-[var(--color-text-tertiary)]">{new Date(item.deletedAt).toLocaleString()}</td>
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        {canActOn(item) ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => handleRestore(item)} disabled={busyId === item._id} className="rounded-lg border border-primary-300 dark:border-primary-800 px-3 py-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50 transition-colors">
                              ↩ Restore
                            </button>
                            <button onClick={() => handlePurge(item)} disabled={busyId === item._id} className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors">
                              Delete Forever
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--color-text-tertiary)]">Super admin only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                <p className="text-xs text-[var(--color-text-tertiary)]">{total} item{total === 1 ? '' : 's'}</p>
                <div className="flex gap-2 items-center">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs disabled:opacity-30 hover:bg-[var(--color-surface-tertiary)] transition-colors">← Prev</button>
                  <span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs disabled:opacity-30 hover:bg-[var(--color-surface-tertiary)] transition-colors">Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TrashManage;
