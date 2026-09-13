import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/axios';

export function ParentTelegramLink() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [deepLink, setDeepLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/telegram/link/status');
      setLinked(Boolean(data.data?.linked));
      setConfigured(Boolean(data.data?.configured));
    } catch {
      setLinked(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const generateLink = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/telegram/link/generate');
      setDeepLink(data.data?.deepLink || '');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate a Telegram link');
    } finally {
      setLoading(false);
    }
  };

  const unlink = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/telegram/unlink');
      setDeepLink('');
      await loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to unlink Telegram');
    } finally {
      setLoading(false);
    }
  };

  if (linked === null || !configured) return null;

  return (
    <div className="mx-auto mt-5 max-w-5xl px-6 pb-8 lg:px-10">
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-xl dark:bg-sky-950/30">✈️</div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-[var(--color-text-primary)]">Telegram Notifications</h2>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Receive attendance and school alerts instantly in Telegram.</p>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

        {linked ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-green-900 dark:bg-green-950/20">
            <p className="text-sm font-semibold text-green-700 dark:text-green-300">✓ Telegram is linked to this parent account.</p>
            <button type="button" onClick={unlink} disabled={loading} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:hover:bg-red-950/30">Unlink</button>
          </div>
        ) : deepLink ? (
          <div className="mt-4 space-y-2">
            <a href={deepLink} target="_blank" rel="noreferrer" onClick={() => window.setTimeout(() => void loadStatus(), 2500)} className="block rounded-xl bg-sky-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-sky-700">Open Telegram to finish linking</a>
            <p className="text-center text-xs text-[var(--color-text-tertiary)]">Tap Start in Telegram, then return to this page.</p>
          </div>
        ) : (
          <button type="button" onClick={generateLink} disabled={loading} className="mt-4 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">
            {loading ? 'Generating link…' : 'Link Telegram'}
          </button>
        )}
      </div>
    </div>
  );
}

export default ParentTelegramLink;
