/**
 * PWA Update Prompt
 *
 * Registers the service worker ourselves (registerType: 'prompt' in
 * vite.config.ts, injectRegister: false) so a newly deployed build never
 * force-reloads a page someone has open — it shows a small "Update
 * available" banner instead, and only reloads when they click it.
 */

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { RefreshCw, X } from 'lucide-react';

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      // Check for a new build every 30 minutes while the tab stays open.
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);
      },
    });
    setUpdateSW(() => update);
  }, []);

  if (!needRefresh || !updateSW) return null;

  return (
    <div className="fixed bottom-4 start-4 end-4 z-[100] sm:bottom-6 sm:start-auto sm:end-6 sm:max-w-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-2xl">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">A new version is available</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">Reload whenever you're ready — your work stays saved.</p>
        </div>
        <button
          onClick={() => updateSW(true)}
          className="flex-shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
        >
          Reload
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="flex-shrink-0 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default PwaUpdatePrompt;
