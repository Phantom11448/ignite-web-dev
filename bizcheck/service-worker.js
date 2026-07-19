// service-worker.js — basic offline caching for BizCheck

const CACHE_NAME = "bizcheck-cache-v3";
const CORE_ASSETS = [
  "/bizcheck/",
  "/bizcheck/index.html",
  "/bizcheck/app.html",
  "/bizcheck/css/styles.css",
  "/bizcheck/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Never intercept Firebase/Firestore calls — let the browser handle
  // those completely normally so data always stays live.
  if (
    request.url.includes("firestore.googleapis.com") ||
    request.url.includes("googleapis.com") ||
    request.url.includes("gstatic.com")
  ) {
    return;
  }

  // Page navigations (loading index.html/app.html) go NETWORK-FIRST.
  // Cache-first for HTML during active development means edits never show
  // up without a manual cache-bust, and — worse — if both the cache lookup
  // and a fallback fetch ever come back empty, the old cache-first logic
  // could resolve with `undefined` instead of a real Response, which
  // Chrome reports as a bare "ERR_FAILED" with no request ever reaching
  // the server. Network-first for navigations avoids both problems: you
  // always get the current page when online, and only fall back to
  // whatever's cached if the network truly fails (offline support).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/bizcheck/index.html");
        })
    );
    return;
  }

  // Cache-first for everything else (CSS/JS/images) — these change less
  // often and benefit from being served instantly from cache.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
