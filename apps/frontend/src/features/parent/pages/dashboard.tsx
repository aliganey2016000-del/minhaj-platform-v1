import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../store/auth-context';
import { Link } from 'react-router-dom';
import api from '../../../lib/axios';

// ---------------------------------------------------------------------------
// Link Telegram — free, unlimited school notifications. The parent opens the
// deep link in Telegram and hits Start; the bot's webhook links their chat
// id to this parent record (see telegram.controller.ts).
// ---------------------------------------------------------------------------

function LinkTelegramCard() {
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

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const generateLink = async () => {
    setLoading(true); setError('');
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
    setLoading(true); setError('');
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

  if (linked === null) return null;
  if (!configured) return null;

  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 text-left shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#229ED9]/10 text-lg">✈️</div>
        <div>
          <h2 className="font-bold text-[var(--color-text-primary)]">Telegram Notifications</h2>
          <p className="text-xs text-[var(--color-text-tertiary)]">Free, instant alerts for attendance and school announcements.</p>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400">{error}</div>}

      {linked ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/20">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">✓ Linked — you'll receive notifications here.</p>
          <button onClick={unlink} disabled={loading} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:hover:bg-red-950/30">Unlink</button>
        </div>
      ) : deepLink ? (
        <div className="mt-4 space-y-3">
          <a href={deepLink} target="_blank" rel="noreferrer" onClick={() => setTimeout(loadStatus, 3000)}
            className="block w-full rounded-xl bg-[#229ED9] px-4 py-3 text-center text-sm font-bold text-white hover:opacity-90 transition-opacity">
            Open Telegram to finish linking
          </a>
          <p className="text-center text-[11px] text-[var(--color-text-tertiary)]">Tap "Start" in the chat that opens, then come back here.</p>
        </div>
      ) : (
        <button onClick={generateLink} disabled={loading}
          className="mt-4 w-full rounded-xl border border-[var(--color-border-default)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] disabled:opacity-50 transition-colors">
          {loading ? 'Generating link…' : 'Link Telegram'}
        </button>
      )}
    </div>
  );
}

export function ParentDashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] pt-20 px-4 pb-10">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 shadow-elevated text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-gold-sm text-2xl">👨‍👩‍👧‍👦</div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Parent Dashboard</h1>
          <p className="mt-2 text-[var(--color-text-secondary)]">Welcome, {user?.email}</p>
          <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">Monitor your children's progress here.</p>
          <div className="mt-8 flex gap-4 justify-center">
            <Link to="/" className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Home</Link>
            <button onClick={logout} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors">Logout</button>
          </div>
        </div>

        <LinkTelegramCard />
      </div>
    </div>
  );
}

export default ParentDashboard;