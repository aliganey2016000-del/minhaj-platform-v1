import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface GalleryItem { _id: string; title: string; description: string; imageUrl: string; album: string; status: 'active' | 'inactive'; uploadedBy?: { _id: string; email: string }; createdAt: string; }

export function GalleryManage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false); const [editing, setEditing] = useState<GalleryItem | undefined>(undefined);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: '12' }; if (search) params.search = search; if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/gallery', { params });
      setItems(data.data || []); setTotal(data.meta?.total || 0);
    } catch (e: any) { setError(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  }, [page, search, statusFilter]);
  useEffect(() => { fetch(); }, [fetch]);

  const handleDelete = async (id: string) => { if (!confirm('Delete?')) return; await api.delete(`/gallery/${id}`); setItems(p => p.filter(i => i._id !== id)); };
  const handleStatus = async (id: string, s: string) => { await api.patch(`/gallery/${id}/status`, { status: s }); setItems(p => p.map(i => i._id === id ? { ...i, status: s as any } : i)); };

  const active = items.filter(i => i.status === 'active').length;
  const albums = [...new Set(items.map(i => i.album || 'general'))];
  const totalPages = Math.ceil(total / 12);
  if (loading && !items.length) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🖼️ Gallery</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} images — {active} active · {albums.length} albums</p></div>
        <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 shadow-sm">+ Add Image</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center"><p className="text-2xl font-bold text-green-700">{active}</p><p className="text-xs">Active</p></div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center"><p className="text-2xl font-bold text-gray-600">{items.filter(i => i.status === 'inactive').length}</p><p className="text-xs">Inactive</p></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center"><p className="text-2xl font-bold text-blue-700">{albums.length}</p><p className="text-xs">Albums</p></div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-center"><p className="text-2xl font-bold text-purple-700">{total}</p><p className="text-xs">Total</p></div>
      </div>
      <div className="flex gap-3"><input type="text" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="flex-1 rounded-xl border px-4 py-2.5 text-sm" /><select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border px-4 py-2.5 text-sm"><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-red-600 text-sm">{error}</div>}

      {/* Gallery Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.length === 0 ? <div className="col-span-full text-center py-16 text-[var(--color-text-tertiary)]">No images yet.</div> :
          items.map(i => (
            <div key={i._id} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card hover:shadow-card-hover transition-shadow">
              <div className="aspect-square bg-[var(--color-surface-secondary)] flex items-center justify-center cursor-pointer relative" onClick={() => setViewImage(i.imageUrl)}>
                {i.imageUrl ? <img src={i.imageUrl} alt={i.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span className="text-4xl">🖼️</span>}
                {!i.imageUrl && <span className="text-4xl absolute">🖼️</span>}
              </div>
              <div className="p-3 space-y-1">
                <p className="font-semibold text-sm truncate">{i.title}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{i.album}</p>
                <div className="flex items-center justify-between pt-1" onClick={e => e.stopPropagation()}>
                  <select value={i.status} onChange={e => handleStatus(i._id, e.target.value)} className="rounded-lg border px-2 py-0.5 text-xs">
                    <option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(i)} className="rounded-lg px-2 py-0.5 text-xs text-primary-600 hover:bg-primary-50">✏️</button>
                    <button onClick={() => handleDelete(i._id)} className="rounded-lg px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">🗑️</button>
                  </div>
                </div>
              </div>
            </div>
          ))
        }
      </div>
      {totalPages > 1 && <div className="flex items-center justify-between px-5 py-3 border rounded-xl bg-[var(--color-surface-secondary)]"><p className="text-xs">{total} images</p><div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">← Prev</button><span className="text-xs">Page {page} of {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">Next →</button></div></div>}
    </div>

    {/* Modals */}
    {(showCreate || editing) && <GalleryModal item={editing} onClose={() => { setShowCreate(false); setEditing(undefined); }} onSaved={() => { setShowCreate(false); setEditing(undefined); fetch(); }} />}
    {viewImage && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setViewImage(null)}>
      <img src={viewImage} alt="Preview" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
      <button onClick={() => setViewImage(null)} className="absolute top-4 right-4 text-white text-3xl">&times;</button>
    </div>}
    </div>
  );
}

function GalleryModal({ item, onClose, onSaved }: { item?: GalleryItem; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDesc] = useState(item?.description || '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl || '');
  const [album, setAlbum] = useState(item?.album || 'general');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload: any = { title, description, imageUrl, album };
      if (isEdit) await api.patch(`/gallery/${item._id}`, payload);
      else await api.post('/gallery', payload);
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Image' : '➕ Add Image'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="text-xs font-semibold mb-1 block">Title *</label><input className="w-full rounded-xl border px-3 py-2 text-sm" value={title} onChange={e => setTitle(e.target.value)} required /></div>
          <div><label className="text-xs font-semibold mb-1 block">Image URL *</label><input className="w-full rounded-xl border px-3 py-2 text-sm" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." required /></div>
          {imageUrl && <img src={imageUrl} alt="Preview" className="w-full h-40 object-cover rounded-xl border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold mb-1 block">Album</label><input className="w-full rounded-xl border px-3 py-2 text-sm" value={album} onChange={e => setAlbum(e.target.value)} /></div><div><label className="text-xs font-semibold mb-1 block">Description</label><input className="w-full rounded-xl border px-3 py-2 text-sm" value={description} onChange={e => setDesc(e.target.value)} /></div></div>
          <div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border px-4 py-2.5 text-sm">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold">{loading ? 'Saving...' : isEdit ? 'Update' : 'Add'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default GalleryManage;