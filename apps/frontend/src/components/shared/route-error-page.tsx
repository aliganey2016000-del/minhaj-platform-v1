/**
 * Route Error Page
 *
 * Router-level errorElement. The most common production failure here is a
 * deployment replacing Vite's content-hashed lazy chunks while an older tab
 * still references the previous build. Recover that case once by clearing the
 * runtime app caches, unregistering the stale controlling service worker, and
 * reloading from the network.
 *
 * Non-chunk render errors still land on the normal retry screen.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouteError } from 'react-router-dom';

const RELOAD_KEY = 'sahal:chunk-reload-at';
const RELOAD_GUARD_MS = 30_000;
const APP_RUNTIME_CACHES = ['app-code-runtime', 'navigations'];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk .* failed|ChunkLoadError/i.test(message);
}

async function clearStaleRuntimeCaches(): Promise<void> {
  if (!('caches' in window)) return;
  await Promise.all(APP_RUNTIME_CACHES.map((name) => window.caches.delete(name)));
}

async function resetServiceWorkerForFreshNavigation(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();

  // A chunk failure means the current app shell and deployed assets disagree.
  // Unregistering here is safe because this path runs only after a chunk-load
  // failure. The next page load comes from the network and registers the
  // current worker again.
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

/**
 * Recover from a deploy/chunk mismatch. Automatic recovery is guarded so a
 * genuine missing asset cannot create an infinite reload loop. A user-initiated
 * retry passes force=true and always performs a clean retry.
 */
export function reloadForNewBuild(force = false): boolean {
  if (!force) {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < RELOAD_GUARD_MS) return false;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // Storage can be unavailable in private modes; continue with one reload.
    }
  }

  void Promise.allSettled([
    clearStaleRuntimeCaches(),
    resetServiceWorkerForFreshNavigation(),
  ]).then(() => window.location.reload());

  return true;
}

export function RouteErrorPage() {
  const error = useRouteError();
  const chunkFailure = isChunkLoadError(error);
  const attemptedRecovery = useRef(false);
  const [recovering, setRecovering] = useState(chunkFailure);

  useEffect(() => {
    if (!chunkFailure || attemptedRecovery.current) return;
    attemptedRecovery.current = true;

    // Give a rolling deployment a moment to finish swapping containers before
    // retrying. This avoids immediately re-requesting a chunk during the same
    // short deployment window.
    const timer = window.setTimeout(() => {
      if (!reloadForNewBuild()) setRecovering(false);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [chunkFailure]);

  if (recovering) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)] px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Updating Sahal…</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            A new version was deployed. Refreshing this page with the latest files.
          </p>
        </div>
      </div>
    );
  }

  if (import.meta.env.DEV) console.error(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)] px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          This page could not be loaded. Please try again. If you just got an update, a fresh reload will load the latest version.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setRecovering(true);
              reloadForNewBuild(true);
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Reload page
          </button>
          <a
            href="/"
            className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)]"
          >
            Go to home
          </a>
        </div>
      </div>
    </div>
  );
}
