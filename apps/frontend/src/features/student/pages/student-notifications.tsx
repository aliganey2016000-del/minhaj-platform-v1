/**
 * Student Notifications — Real API-driven with i18n
 */
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

interface Notification {
  _id: string; title: string; message: string; type: 'info' | 'success' | 'warning' | 'error';
  link?: string; read: boolean; createdAt: string;
}

const typeStyles: Record<string, string> = {
  info: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20',
  success: 'border-l-green-500 bg-green-50/50 dark:bg-green-950/20',
  warning: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
  error: 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20',
};
const typeIcons: Record<string, string> = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };

export function StudentNotifications() {
  const { t } = useTranslation('common');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchNotifications = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: any = { page: String(page), limit: '20' };
      if (filter === 'unread') params.read = 'false';
      const { data } = await api.get('/notifications/my', { params });
      setNotifications(data.data || []); setTotal(data.meta?.total || 0); setUnreadCount(data.unreadCount ?? 0);
    } catch (err: any) { setError(err.response?.data?.message || t('error_occurred')); } finally { setLoading(false); }
  }, [page, filter, t]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try { await api.patch(`/notifications/${id}/read`); setNotifications(prev => prev.map(n => n._id===id?{...n,read:true}:n)); setUnreadCount(prev=>Math.max(0,prev-1)); } catch {}
  };
  const markAllRead = async () => {
    try { await api.patch('/notifications/read-all'); setNotifications(prev => prev.map(n=>({...n,read:true}))); setUnreadCount(0); } catch {}
  };
  const handleDelete = async (id: string) => {
    try { await api.delete(`/notifications/${id}`); const wasUnread = notifications.find(n=>n._id===id)?.read===false; setNotifications(prev=>prev.filter(n=>n._id!==id)); if(wasUnread) setUnreadCount(prev=>Math.max(0,prev-1)); } catch {}
  };
  const totalPages = Math.ceil(total / 20);

  if (loading && notifications.length===0) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10"><div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🔔 {t('notifications')}</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">{total} {t('total')} · {unreadCount} {t('unread')}</p></div>
        {unreadCount > 0 && <button onClick={markAllRead} className="rounded-xl border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">✅ {t('mark_all_read')}</button>}
      </div>
      <div className="flex gap-2">{(['all','unread']as const).map(f=>(<button key={f} onClick={()=>{setFilter(f);setPage(1);}} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${filter===f?'bg-primary-600 text-white shadow-sm':'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'}`}>{f==='all'?'All':`${t('unread')} (${unreadCount})`}</button>))}</div>
      {error&&<div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
      {notifications.length===0?<div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-5xl mb-4">🔔</p><p className="text-lg">{filter==='unread'?t('no_unread'):t('no_notifications')}</p></div>:<div className="space-y-3">{notifications.map(n=>(<div key={n._id} className={`relative rounded-xl border border-[var(--color-border-default)] border-l-4 bg-[var(--color-surface-primary)] p-4 shadow-card hover:shadow-card-hover transition-all cursor-pointer ${typeStyles[n.type]}`} onClick={()=>{if(!n.read)markAsRead(n._id);if(n.link)window.location.href=n.link;}}><div className="flex items-start gap-3"><span className="text-xl flex-shrink-0 mt-0.5">{typeIcons[n.type]}</span><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><h3 className={`text-sm font-bold ${!n.read?'text-[var(--color-text-primary)]':'text-[var(--color-text-tertiary)]'}`}>{n.title}</h3>{!n.read&&<span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"/>}</div><p className={`text-xs mt-0.5 ${!n.read?'text-[var(--color-text-secondary)]':'text-[var(--color-text-tertiary)]'}`}>{n.message}</p><p className="text-[10px] text-[var(--color-text-tertiary)] mt-2">{new Date(n.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · {new Date(n.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p></div><button onClick={(e)=>{e.stopPropagation();handleDelete(n._id);}} className="text-xs text-[var(--color-text-tertiary)] hover:text-red-500 flex-shrink-0" title="Delete" style={{opacity:0.3}}>🗑️</button></div></div>))}</div>}
      {totalPages>1&&<div className="flex items-center justify-center gap-3"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs disabled:opacity-30">← Prev</button><span className="text-xs text-[var(--color-text-tertiary)]">Page {page} of {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs disabled:opacity-30">Next →</button></div>}
    </div></div>
  );
}
export default StudentNotifications;