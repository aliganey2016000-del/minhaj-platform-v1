/**
 * Trash — app-wide soft-delete recovery. Anything deleted from Manage
 * Students, Parents, Teachers, Classes, Courses, or Organization Management
 * lands here instead of being gone immediately; it can be restored or
 * permanently purged.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

interface TrashItem {
  _id: string;
  entityType: 'Parent' | 'Teacher' | 'Class' | 'Course' | 'School' | 'Student';
  label: string;
  school?: { _id: string; name: string } | null;
  deletedBy?: { _id: string; email: string } | null;
  deletedAt: string;
}

interface UndoState {
  item: TrashItem;
  entityId: string | null;
}

type ConfirmModalState =
  | { kind: 'purge-one'; item: TrashItem }
  | { kind: 'purge-bulk'; ids: string[] }
  | { kind: 'empty' }
  | null;

const ENTITY_TYPES: TrashItem['entityType'][] = ['Student', 'Parent', 'Teacher', 'Class', 'Course', 'School'];

const TYPE_STYLES: Record<string, string> = {
  Student: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  Parent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Course: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  School: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// Where to re-delete a just-restored entity if the admin clicks Undo.
const ENTITY_DELETE_PATH: Record<string, string> = {
  Student: '/students', Parent: '/parents', Teacher: '/teachers', Class: '/classes', Course: '/courses', School: '/schools',
};

const UNDO_WINDOW_MS = 7000;

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmTyped, setConfirmTyped] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<number | null>(null);
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
  useEffect(() => () => { if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current); }, []);

  const canActOn = (item: TrashItem) => item.entityType !== 'School' || isSuperAdmin;
  const totalPages = Math.ceil(total / limit);

  // ── Selection ──
  const toggleSelected = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectableItems = items.filter(canActOn);
  const allSelected = selectableItems.length > 0 && selectableItems.every(i => selected.has(i._id));
  const toggleSelectAll = () => setSelected(prev => {
    if (allSelected) return new Set();
    const n = new Set(prev);
    selectableItems.forEach(i => n.add(i._id));
    return n;
  });
  useEffect(() => { setSelected(new Set()); }, [page, entityType]);

  // ── Restore (optimistic + undo) ──
  const dismissUndo = () => {
    if (undoTimerRef.current) { window.clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
    setUndo(null);
  };

  const handleRestore = async (item: TrashItem) => {
    setItems(prev => prev.filter(i => i._id !== item._id));
    setTotal(t => Math.max(0, t - 1));
    setSelected(prev => { const n = new Set(prev); n.delete(item._id); return n; });
    setError('');
    try {
      const { data } = await api.post(`/trash/${item._id}/restore`);
      dismissUndo();
      undoTimerRef.current = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
      setUndo({ item, entityId: data.data?.entityId || null });
    } catch (err: any) {
      // Restore failed server-side — the optimistic removal was wrong, put it back.
      setError(err.response?.data?.message || 'Failed to restore');
      setItems(prev => [item, ...prev]);
      setTotal(t => t + 1);
    }
  };

  const handleUndo = async () => {
    if (!undo) return;
    const { item, entityId } = undo;
    dismissUndo();
    const path = ENTITY_DELETE_PATH[item.entityType];
    if (!entityId || !path) { setError('Cannot undo — missing reference.'); return; }
    try {
      await api.delete(`${path}/${entityId}`);
      setMessage(`"${item.label}" moved back to Trash`);
      fetchItems();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to undo'); }
  };

  // ── Single purge (confirm modal) ──
  const confirmPurgeOne = async (item: TrashItem) => {
    setConfirmBusy(true); setError('');
    try {
      await api.delete(`/trash/${item._id}`);
      setItems(prev => prev.filter(i => i._id !== item._id));
      setTotal(t => Math.max(0, t - 1));
      setSelected(prev => { const n = new Set(prev); n.delete(item._id); return n; });
      setMessage(`"${item.label}" permanently deleted`);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to delete'); }
    finally { setConfirmBusy(false); setConfirmModal(null); }
  };

  // ── Bulk actions ──
  const handleBulkRestore = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true); setError('');
    try {
      const { data } = await api.post('/trash/bulk-restore', { ids });
      const restoredIds = new Set((data.data?.results || []).filter((r: any) => r.success).map((r: any) => r.id));
      setItems(prev => prev.filter(i => !restoredIds.has(i._id)));
      setTotal(t => Math.max(0, t - restoredIds.size));
      setSelected(new Set());
      setMessage(`Restored ${data.data?.restored ?? 0} of ${ids.length} item(s)`);
    } catch (err: any) { setError(err.response?.data?.message || 'Bulk restore failed'); }
    finally { setBulkBusy(false); }
  };

  const confirmBulkPurge = async (ids: string[]) => {
    setConfirmBusy(true); setError('');
    try {
      const { data } = await api.delete('/trash/bulk', { data: { ids } });
      const deletedIds = new Set((data.data?.results || []).filter((r: any) => r.success).map((r: any) => r.id));
      setItems(prev => prev.filter(i => !deletedIds.has(i._id)));
      setTotal(t => Math.max(0, t - deletedIds.size));
      setSelected(new Set());
      setMessage(`Permanently deleted ${data.data?.deleted ?? 0} of ${ids.length} item(s)`);
    } catch (err: any) { setError(err.response?.data?.message || 'Bulk delete failed'); }
    finally { setConfirmBusy(false); setConfirmModal(null); }
  };

  // ── Empty Trash (optimistic — the response already tells us the result) ──
  const confirmEmpty = async () => {
    setConfirmBusy(true); setError('');
    try {
      const { data } = await api.delete('/trash', { data: { confirm: true } });
      setItems([]); setTotal(0); setPage(1); setSelected(new Set());
      setMessage(`Permanently deleted ${data.data?.deleted ?? 0} item(s)`);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to empty trash'); }
    finally { setConfirmBusy(false); setConfirmModal(null); setConfirmTyped(''); }
  };

  const closeConfirm = () => { setConfirmModal(null); setConfirmTyped(''); };

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🗑️ Trash</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} deleted item{total === 1 ? '' : 's'} — restore or permanently delete</p>
          </div>
          <button
            onClick={() => total > 0 && setConfirmModal({ kind: 'empty' })}
            disabled={total === 0}
            className="rounded-xl border border-red-300 dark:border-red-800 px-5 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            🗑️ Empty Trash
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

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 px-4 py-3">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">{selected.size} selected</span>
            <button onClick={handleBulkRestore} disabled={bulkBusy} className="rounded-lg border border-primary-300 dark:border-primary-700 bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 disabled:opacity-50 transition-colors">
              ↩ Restore Selected
            </button>
            <button onClick={() => setConfirmModal({ kind: 'purge-bulk', ids: Array.from(selected) })} disabled={bulkBusy} className="rounded-lg border border-red-300 dark:border-red-700 bg-[var(--color-surface-primary)] px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors">
              Delete Selected
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-[var(--color-text-tertiary)] hover:underline ml-auto">Clear selection</button>
          </div>
        )}

        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!loading && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] border-b border-[var(--color-border-default)]">
                  <tr>
                    <th className="px-5 py-3 w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={selectableItems.length === 0} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30" />
                    </th>
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
                    <tr><td colSpan={7} className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg mb-1">🗑️ Trash is empty</p><p className="text-sm">Deleted students, parents, teachers, classes, courses, and organizations will show up here.</p></td></tr>
                  ) : items.map(item => (
                    <tr key={item._id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors">
                      <td className="px-5 py-4">
                        <input type="checkbox" checked={selected.has(item._id)} onChange={() => toggleSelected(item._id)} disabled={!canActOn(item)} className="h-4 w-4 rounded border-[var(--color-border-default)] text-primary-600 focus:ring-primary-500/30 disabled:opacity-30" />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[item.entityType] || 'bg-gray-100 text-gray-600'}`}>{item.entityType}</span></td>
                      <td className="px-5 py-4 whitespace-nowrap font-medium text-[var(--color-text-primary)]">{item.label}</td>
                      <td className="px-5 py-4 hidden md:table-cell whitespace-nowrap text-[var(--color-text-secondary)]">{item.school?.name || '—'}</td>
                      <td className="px-5 py-4 hidden sm:table-cell whitespace-nowrap text-xs text-[var(--color-text-tertiary)]">{item.deletedBy?.email || '—'}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-[var(--color-text-tertiary)]">{new Date(item.deletedAt).toLocaleString()}</td>
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        {canActOn(item) ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => handleRestore(item)} className="rounded-lg border border-primary-300 dark:border-primary-800 px-3 py-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors">
                              ↩ Restore
                            </button>
                            <button onClick={() => setConfirmModal({ kind: 'purge-one', item })} className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
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

      {/* Undo snackbar */}
      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-xl bg-gray-900 dark:bg-black px-5 py-3 text-sm text-white shadow-2xl">
          <span>✅ "{undo.item.label}" restored</span>
          <button onClick={handleUndo} className="font-semibold text-primary-300 hover:text-primary-200 underline underline-offset-2">Undo</button>
          <button onClick={dismissUndo} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={closeConfirm}>
          <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            {confirmModal.kind === 'purge-one' && (
              <>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">Delete Forever?</h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-5">Permanently delete <strong>"{confirmModal.item.label}"</strong>? This cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={closeConfirm} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
                  <button onClick={() => confirmPurgeOne(confirmModal.item)} disabled={confirmBusy} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors">{confirmBusy ? 'Deleting...' : 'Delete Forever'}</button>
                </div>
              </>
            )}
            {confirmModal.kind === 'purge-bulk' && (
              <>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">Delete {confirmModal.ids.length} items forever?</h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-5">This cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={closeConfirm} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
                  <button onClick={() => confirmBulkPurge(confirmModal.ids)} disabled={confirmBusy} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors">{confirmBusy ? 'Deleting...' : `Delete ${confirmModal.ids.length} Items`}</button>
                </div>
              </>
            )}
            {confirmModal.kind === 'empty' && (
              <>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">Empty Trash?</h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">This will permanently delete <strong>all {total} item{total === 1 ? '' : 's'}</strong> in Trash. This cannot be undone.</p>
                <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1.5">Type <strong className="text-red-600">DELETE</strong> to confirm</label>
                <input
                  autoFocus type="text" value={confirmTyped} onChange={e => setConfirmTyped(e.target.value)}
                  placeholder="DELETE"
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <div className="flex gap-3">
                  <button onClick={closeConfirm} className="flex-1 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Cancel</button>
                  <button onClick={confirmEmpty} disabled={confirmBusy || confirmTyped !== 'DELETE'} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{confirmBusy ? 'Emptying...' : 'Empty Trash'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrashManage;
