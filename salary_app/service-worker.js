const CACHE_NAME = "breakfast-payroll-shell-v35-cleanup-only";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("breakfast-")).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return;
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/api/auth/")
  ) return;
  event.respondWith(fetch(new Request(event.request, { cache: "no-store" })));
});
