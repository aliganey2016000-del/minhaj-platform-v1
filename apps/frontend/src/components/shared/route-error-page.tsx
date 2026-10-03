/**
 * Route Error Page
 *
 * Router-level errorElement. Without one, any render error or failed lazy
 * page import fell through to React Router's built-in "Unexpected
 * Application Error" developer screen.
 *
 * The most common cause in production is a deploy: a tab opened before it
 * still references the previous build's hashed page chunks, which no longer
 * exist on the server. That case reloads once to pick up the new build;
 * anything else shows a friendly retry screen.
 */

import { useRouteError } from 'react-router-dom';

const RELOAD_KEY = 'sahal:chunk-reload-at';
// Don't reload again if we already did within this window — a chunk that
// is still missing after a fresh load is a real error, not a stale tab.
const RELOAD_GUARD_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
}

/** Reloads the page once per guard window. Returns false if it already did. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode): reloading once is still better
    // than a broken page, and a second failure lands on the screen below.
  }
  window.location.reload();
  return true;
}

export function RouteErrorPage() {
  const error = useRouteError();

  if (isChunkLoadError(error) && reloadForNewBuild()) {
    return null;
  }

  if (import.meta.env.DEV) console.error(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)] px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          This page could not be loaded. Please try again. If you just got an update, reloading usually fixes it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
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
