const CACHE_NAME = "breakfast-operations-pwa-v1";
const OFFLINE_URL = "/offline.html";
const CORE_FILES = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/salary_app/assets/app-icon-192.png",
  "/salary_app/assets/app-icon-512.png",
  "/salary_app/assets/app-icon-180.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("breakfast-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && !url.search) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === "navigate") return (await caches.match(OFFLINE_URL)) || Response.error();
      return Response.error();
    }
  })());
});
