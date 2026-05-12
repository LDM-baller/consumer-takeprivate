// Service worker: force every same-origin fetch to bypass the HTTP cache.
// Installed once; from then on every page load reads fresh from the network.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-store' })
      .catch(() => fetch(e.request))
  );
});
