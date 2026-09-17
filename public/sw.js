/// <reference lib="webworker" />

// Bump the version whenever caching rules change — `activate` drops every
// cache whose name differs, which is how stale bundles get purged.
const CACHE_NAME = "loka-pos-v2";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = ["/pos", "/login", "/offline.html"];

const CACHEABLE_ORIGINS = [self.location.origin];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Network-first with cache fallback. Used for both navigations and static
// assets: production chunks are content-hashed and served with immutable
// cache headers, so the browser HTTP cache already makes the network path
// cheap — while a cache-first SW would keep serving a stale bundle forever
// whenever a URL is reused (dev chunks, sw.js itself, manifest, icons).
function networkFirst(request, fallbackUrl) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() =>
      caches
        .match(request)
        .then((cached) => cached || (fallbackUrl ? caches.match(fallbackUrl) : undefined))
        .then((cached) => cached || Response.error())
    );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API calls
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, OFFLINE_URL));
    return;
  }

  if (
    CACHEABLE_ORIGINS.includes(url.origin) &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js"))
  ) {
    event.respondWith(networkFirst(request));
  }
});
