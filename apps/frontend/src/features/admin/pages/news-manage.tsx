/**
 * News Management — Admin
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface NewsItem { _id: string; title: string; content: string; image?: string; category: string; status: 'active' | 'inactive'; createdBy?: { _id: string; email: string }; createdAt: string; }

export function NewsManage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false); const [editing, setEditing] = useState<NewsItem | undefined>(undefined);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);

  const fetch = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: '15' }; if (search) params.search = search; if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/news', { params });
      setItems(data.data || []); setTotal(data.meta?.total || 0);
    } catch (e: any) { setError(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  }, [page, search, statusFilter]);
  useEffect(() => { fetch(); }, [fetch]);

  const handleDelete = async (id: string) => { if (!confirm('Delete?')) return; await api.delete(`/news/${id}`); setItems(p => p.filter(i => i._id !== id)); };
  const handleStatus = async (id: string, s: string) => { await api.patch(`/news/${id}/status`, { status: s }); setItems(p => p.map(i => i._id === id ? { ...i, status: s as any } : i)); };

  const active = items.filter(i => i.status === 'active').length;
  const totalPages = Math.ceil(total / 15);
  if (loading && !items.length) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">📰 News</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} total — {active} active</p></div>
        <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 shadow-sm">+ New Article</button>
      </div>
      <div className="grid grid-cols-2 gap-4"><div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{active}</p><p className="text-xs">Active</p></div><div className="rounded-xl border border-gray-200 bg-gray-50 dark:bg-gray-800/30 p-4 text-center"><p className="text-2xl font-bold text-gray-600">{items.filter(i => i.status === 'inactive').length}</p><p className="text-xs">Inactive</p></div></div>
      <div className="flex gap-3"><input type="text" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="flex-1 rounded-xl border px-4 py-2.5 text-sm" /><select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border px-4 py-2.5 text-sm"><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-red-600 text-sm">{error}</div>}
      <div className="rounded-2xl border bg-[var(--color-surface-primary)] overflow-hidden shadow-card"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] border-b"><tr><th className="text-left px-5 py-3 font-semibold">Title</th><th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Category</th><th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Image</th><th className="text-center px-5 py-3 font-semibold">Status</th><th className="text-center px-5 py-3 font-semibold">Actions</th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={5} className="text-center py-16">No articles yet.</td></tr> : items.map(i => <tr key={i._id} className="border-b hover:bg-[var(--color-surface-secondary)]"><td className="px-5 py-4"><p className="font-semibold">{i.title}</p><p className="text-xs text-[var(--color-text-tertiary)] line-clamp-1">{i.content.substring(0, 100)}</p></td><td className="px-5 py-4 text-center hidden sm:table-cell text-xs">{i.category}</td><td className="px-5 py-4 text-center hidden md:table-cell">{i.image ? '🖼️' : '—'}</td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><select value={i.status} onChange={e => handleStatus(i._id, e.target.value)} className="rounded-lg border px-2 py-1 text-xs"><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><div className="flex justify-center gap-1"><button onClick={() => setEditing(i)} className="rounded-lg px-3 py-1.5 text-xs text-primary-600 hover:bg-primary-50">✏️</button><button onClick={() => handleDelete(i._id)} className="rounded-lg px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">🗑️</button></div></td></tr>)}</tbody></table></div>{totalPages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t bg-[var(--color-surface-secondary)]"><p className="text-xs">{total} items</p><div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">← Prev</button><span className="text-xs">Page {page} of {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">Next →</button></div></div>}</div>
    </div>
    {(showCreate || editing) && <ContentModal type="News" item={editing} onClose={() => { setShowCreate(false); setEditing(undefined); }} onSaved={() => { setShowCreate(false); setEditing(undefined); fetch(); }} extraFields={<><div><label className="text-xs font-semibold mb-1 block">Image URL</label><input id="imageUrl" className="w-full rounded-xl border px-3 py-2 text-sm" defaultValue={editing?.image || ''} placeholder="https://..." /></div><div><label className="text-xs font-semibold mb-1 block">Category</label><input id="category" className="w-full rounded-xl border px-3 py-2 text-sm" defaultValue={editing?.category || ''} /></div></>} />}
    </div>
  );
}

function ContentModal({ type, item, onClose, onSaved, extraFields }: { type: string; item?: any; onClose: () => void; onSaved: () => void; extraFields?: JSX.Element }) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title || '');
  const [content, setContent] = useState(item?.content || item?.description || '');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload: any = { title, content: content || undefined, description: content || undefined };
      if (!isEdit) {
        const imageUrl = (document.getElementById('imageUrl') as HTMLInputElement)?.value;
        const album = (document.getElementById('album') as HTMLInputElement)?.value;
        const eventDate = (document.getElementById('eventDate') as HTMLInputElement)?.value;
        const startTime = (document.getElementById('startTime') as HTMLInputElement)?.value;
        const endTime = (document.getElementById('endTime') as HTMLInputElement)?.value;
        const location = (document.getElementById('location') as HTMLInputElement)?.value;
        const category = (document.getElementById('category') as HTMLInputElement)?.value;
        if (imageUrl) { payload.imageUrl = imageUrl; payload.image = imageUrl; }
        if (album) payload.album = album;
        if (eventDate) payload.eventDate = eventDate;
        if (startTime) payload.startTime = startTime;
        if (endTime) payload.endTime = endTime;
        if (location) payload.location = location;
        if (category) payload.category = category;
      }
      const eps: Record<string, string> = { News: '/news', Event: '/events', Gallery: '/gallery' };
      if (isEdit) await api.patch(`${eps[type]}/${item._id}`, payload);
      else await api.post(eps[type], payload);
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  const labels: Record<string, string> = { News: 'Article', Event: 'Event', Gallery: 'Image' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEdit ? `✏️ Edit ${labels[type]}` : `➕ New ${labels[type]}`}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="text-xs font-semibold mb-1 block">Title *</label><input className="w-full rounded-xl border px-3 py-2 text-sm" value={title} onChange={e => setTitle(e.target.value)} required /></div>
          {extraFields}
          <div><label className="text-xs font-semibold mb-1 block">Content/Description *</label><textarea className="w-full rounded-xl border px-3 py-2 text-sm" rows={4} value={content} onChange={e => setContent(e.target.value)} required /></div>
          <div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border px-4 py-2.5 text-sm">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold">{loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default NewsManage;