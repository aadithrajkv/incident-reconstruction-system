const CACHE = "thotox-shell-v8";
const SHELL = [
  "/",
  "/index.html",
  "/app.js",
  "/auth-config.js",
  "/manifest.webmanifest",
  "/assets/thotox-mark.svg",
  "/assets/thotox-180.png",
  "/assets/thotox-192.png",
  "/assets/thotox-512.png",
  "/assets/neighborhood-welcome-hd.webp",
  "/assets/chai-cart-business.webp",
  "/assets/local-issue-example.webp",
  "/assets/neighborhood-grid-story.webp",
  "/landmask.json.gz"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("thotox-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put("/index.html", response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/index.html"))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
