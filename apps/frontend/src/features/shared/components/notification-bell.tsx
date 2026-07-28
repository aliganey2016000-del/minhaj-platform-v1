/**
 * Notification Bell — lives in the shared DashboardHeader (every role).
 * Backed by RealtimeContext: initial list from REST, live updates via
 * Socket.IO ('notification:new'), mark-as-read/mark-all-read.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtime, type NotificationItem } from '../../../store/realtime-context';
import { getPushSubscriptionState, subscribeToPush, unsubscribeFromPush } from '../../../lib/push';

const typeDot: Record<string, string> = {
  info: 'bg-blue-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllRead } = useRealtime();
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading'>('loading');
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) getPushSubscriptionState().then(setPushState);
  }, [open]);

  async function togglePush() {
    if (pushState === 'subscribed') {
      await unsubscribeFromPush();
      setPushState('unsubscribed');
    } else {
      const result = await subscribeToPush();
      setPushState(result === 'subscribed' ? 'subscribed' : result);
    }
  }

  function handleClick(n: NotificationItem) {
    if (!n.read) markAsRead(n._id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[var(--color-surface-primary)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-default)]">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-[var(--color-text-tertiary)]">
                No notifications yet
              </div>
            )}
            {notifications.map((n) => (
              <button
                key={n._id}
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left border-b border-[var(--color-border-default)] last:border-0 transition-colors hover:bg-[var(--color-surface-secondary)] ${
                  !n.read ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''
                }`}
              >
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${typeDot[n.type] || typeDot.info}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${!n.read ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-2">{n.message}</p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
          {pushState !== 'unsupported' && (
            <div className="px-4 py-2.5 border-t border-[var(--color-border-default)]">
              {pushState === 'denied' ? (
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Push notifications are blocked in your browser settings.
                </p>
              ) : (
                <button
                  onClick={togglePush}
                  disabled={pushState === 'loading'}
                  className="flex w-full items-center justify-between text-xs font-medium text-[var(--color-text-secondary)] hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-50"
                >
                  <span>Push notifications</span>
                  <span className={pushState === 'subscribed' ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                    {pushState === 'loading' ? '…' : pushState === 'subscribed' ? 'On — turn off' : 'Turn on'}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
