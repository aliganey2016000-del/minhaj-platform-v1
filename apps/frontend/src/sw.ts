/// <reference lib="webworker" />
/**
 * Custom Service Worker (injectManifest strategy)
 *
 * Replaces vite-plugin-pwa's auto-generated (generateSW) service worker so
 * we can add `push` / `notificationclick` handlers for Web Push — those
 * event listeners can't be injected into a generateSW-produced worker.
 * Everything that generateSW used to configure via `workbox: {...}` in
 * vite.config.ts is now hand-written below using the same runtime-caching
 * rules, so offline/PWA behavior is unchanged.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// ---------------------------------------------------------------------------
// Precache — injected at build time by vite-plugin-pwa (injectManifest)
// ---------------------------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

// ---------------------------------------------------------------------------
// Runtime caching — mirrors the previous generateSW `workbox.runtimeCaching`
// config exactly, rule for rule.
// ---------------------------------------------------------------------------

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => /\/api\/.*\/my\/.*/i.test(url.pathname),
  new NetworkFirst({
    cacheName: 'api-student-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => /\/api\/courses\/.*\/content/i.test(url.pathname),
  new NetworkFirst({
    cacheName: 'api-course-content-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => /\/api\/gamification\/(my|leaderboard)/i.test(url.pathname),
  new NetworkFirst({
    cacheName: 'api-gamification-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 2 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Socket.IO's own long-polling/websocket requests must never be intercepted.
registerRoute(({ url }) => url.pathname.startsWith('/socket.io/'), new NetworkOnly());

registerRoute(({ url }) => /\/api\//i.test(url.pathname), new NetworkOnly());

// Cache application code only after it is actually requested. Build output uses
// content-hashed filenames, so CacheFirst is safe across deployments while
// avoiding the previous install-time download of every route chunk.
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    (request.destination === 'script' || request.destination === 'style'),
  new CacheFirst({
    cacheName: 'app-code-runtime',
    plugins: [
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => /\.(mp4|webm|ogg|mov|mkv|avi)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: 'offline-video-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
    matchOptions: { ignoreVary: true },
  })
);

// Navigation fallback for offline page loads (excludes /api/ and /_ paths)
registerRoute(
  new NavigationRoute(
    async (params) => {
      try {
        return await new NetworkFirst({ cacheName: 'navigations' }).handle(params);
      } catch {
        const cache = await caches.open('offline-fallback');
        return (await cache.match('/offline.html')) || Response.error();
      }
    },
    { denylist: [/^\/api\//, /^\/_/] }
  )
);

// Pre-cache the offline fallback page itself so the catch-handler above works
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('offline-fallback').then((cache) => cache.add('/offline.html'))
  );
});

// ---------------------------------------------------------------------------
// Web Push — the reason this is a custom service worker at all.
// ---------------------------------------------------------------------------

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: { title?: string; message?: string; link?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Sahal Education Platform', message: event.data.text() };
  }

  const title = payload.title || 'Sahal Education Platform';
  const options: NotificationOptions = {
    body: payload.message || '',
    icon: '/icons/pwa-192x192.png',
    badge: '/icons/pwa-192x192.png',
    data: { link: payload.link || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const link = (event.notification.data as { link?: string })?.link || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          (client as WindowClient).navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
