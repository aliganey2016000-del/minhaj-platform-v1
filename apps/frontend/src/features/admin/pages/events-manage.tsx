import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface EventItem { _id: string; title: string; description: string; eventDate: string; startTime?: string; endTime?: string; location?: string; image?: string; status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled'; createdBy?: { _id: string; email: string }; createdAt: string; }

export function EventsManage() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false); const [editing, setEditing] = useState<EventItem | undefined>(undefined);
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);

  const fetch = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: '15' }; if (search) params.search = search; if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/events', { params });
      setItems(data.data || []); setTotal(data.meta?.total || 0);
    } catch (e: any) { setError(e.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  }, [page, search, statusFilter]);
  useEffect(() => { fetch(); }, [fetch]);

  const handleDelete = async (id: string) => { if (!confirm('Delete?')) return; await api.delete(`/events/${id}`); setItems(p => p.filter(i => i._id !== id)); };
  const handleStatus = async (id: string, s: string) => { await api.patch(`/events/${id}/status`, { status: s }); setItems(p => p.map(i => i._id === id ? { ...i, status: s as any } : i)); };

  const statusCount = (s: string) => items.filter(i => i.status === s).length;
  const totalPages = Math.ceil(total / 15);
  if (loading && !items.length) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🎉 Events</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} total — {statusCount('upcoming')} upcoming, {statusCount('ongoing')} ongoing, {statusCount('completed')} completed, {statusCount('cancelled')} cancelled</p></div>
        <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 shadow-sm">+ New Event</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4 text-center"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{statusCount('upcoming')}</p><p className="text-xs">Upcoming</p></div>
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-center"><p className="text-2xl font-bold text-green-700 dark:text-green-300">{statusCount('ongoing')}</p><p className="text-xs">Ongoing</p></div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/30 p-4 text-center"><p className="text-2xl font-bold text-purple-700">{statusCount('completed')}</p><p className="text-xs">Completed</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-center"><p className="text-2xl font-bold text-red-700">{statusCount('cancelled')}</p><p className="text-xs">Cancelled</p></div>
      </div>
      <div className="flex gap-3"><input type="text" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="flex-1 rounded-xl border px-4 py-2.5 text-sm" /><select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border px-4 py-2.5 text-sm"><option value="">All</option><option value="upcoming">Upcoming</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-red-600 text-sm">{error}</div>}
      <div className="rounded-2xl border bg-[var(--color-surface-primary)] overflow-hidden shadow-card"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[var(--color-surface-secondary)] border-b"><tr><th className="text-left px-5 py-3 font-semibold">Event</th><th className="text-center px-5 py-3 font-semibold hidden sm:table-cell">Date</th><th className="text-center px-5 py-3 font-semibold hidden md:table-cell">Time</th><th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Location</th><th className="text-center px-5 py-3 font-semibold">Status</th><th className="text-center px-5 py-3 font-semibold">Actions</th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={6} className="text-center py-16">No events yet.</td></tr> : items.map(i => <tr key={i._id} className="border-b hover:bg-[var(--color-surface-secondary)]"><td className="px-5 py-4"><p className="font-semibold">{i.title}</p></td><td className="px-5 py-4 text-center hidden sm:table-cell text-xs">{new Date(i.eventDate).toLocaleDateString()}</td><td className="px-5 py-4 text-center hidden md:table-cell text-xs">{i.startTime && i.endTime ? `${i.startTime}-${i.endTime}` : '—'}</td><td className="px-5 py-4 text-center hidden lg:table-cell text-xs">{i.location || '—'}</td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><select value={i.status} onChange={e => handleStatus(i._id, e.target.value)} className="rounded-lg border px-2 py-1 text-xs"><option value="upcoming">Upcoming</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td><td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}><div className="flex justify-center gap-1"><button onClick={() => setEditing(i)} className="rounded-lg px-3 py-1.5 text-xs text-primary-600 hover:bg-primary-50">✏️</button><button onClick={() => handleDelete(i._id)} className="rounded-lg px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">🗑️</button></div></td></tr>)}</tbody></table></div>{totalPages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t bg-[var(--color-surface-secondary)]"><p className="text-xs">{total} events</p><div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">← Prev</button><span className="text-xs">Page {page} of {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">Next →</button></div></div>}</div>
    </div>
    {(showCreate || editing) && <EventModal item={editing} onClose={() => { setShowCreate(false); setEditing(undefined); }} onSaved={() => { setShowCreate(false); setEditing(undefined); fetch(); }} />}
    </div>
  );
}

function EventModal({ item, onClose, onSaved }: { item?: EventItem; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDesc] = useState(item?.description || '');
  const [eventDate, setEventDate] = useState(item?.eventDate ? new Date(item.eventDate).toISOString().split('T')[0] : '');
  const [startTime, setStartTime] = useState(item?.startTime || '');
  const [endTime, setEndTime] = useState(item?.endTime || '');
  const [location, setLocation] = useState(item?.location || '');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload: any = { title, description, eventDate, startTime: startTime || undefined, endTime: endTime || undefined, location: location || undefined };
      if (isEdit) await api.patch(`/events/${item._id}`, payload);
      else await api.post('/events', payload);
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEdit ? '✏️ Edit Event' : '➕ New Event'}</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="text-xs font-semibold mb-1 block">Title *</label><input className="w-full rounded-xl border px-3 py-2 text-sm" value={title} onChange={e => setTitle(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold mb-1 block">Date *</label><input type="date" className="w-full rounded-xl border px-3 py-2 text-sm" value={eventDate} onChange={e => setEventDate(e.target.value)} required /></div><div><label className="text-xs font-semibold mb-1 block">Location</label><input className="w-full rounded-xl border px-3 py-2 text-sm" value={location} onChange={e => setLocation(e.target.value)} /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold mb-1 block">Start Time</label><input type="time" className="w-full rounded-xl border px-3 py-2 text-sm" value={startTime} onChange={e => setStartTime(e.target.value)} /></div><div><label className="text-xs font-semibold mb-1 block">End Time</label><input type="time" className="w-full rounded-xl border px-3 py-2 text-sm" value={endTime} onChange={e => setEndTime(e.target.value)} /></div></div>
          <div><label className="text-xs font-semibold mb-1 block">Description *</label><textarea className="w-full rounded-xl border px-3 py-2 text-sm" rows={3} value={description} onChange={e => setDesc(e.target.value)} required /></div>
          <div className="flex gap-2 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border px-4 py-2.5 text-sm">Cancel</button><button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold">{loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default EventsManage;