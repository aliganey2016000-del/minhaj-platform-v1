/**
 * Teacher-facing copy for the device's verified offline login window.
 * Use local calendar dates and times (never UTC date truncation), since
 * administrators set a duration measured in complete 24-hour periods.
 */
export function formatOfflineAccessDate(timestamp: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}

export function offlineAccessTimeLeft(expiresAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.ceil((expiresAt - now) / 60_000));
  if (!minutes) return 'Expired — reconnect to renew';
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  if (days) return `${days} day${days === 1 ? '' : 's'}${hours ? `, ${hours} hr` : ''} remaining`;
  if (hours) return `${hours} hr${mins ? `, ${mins} min` : ''} remaining`;
  return `${minutes} min remaining`;
}
