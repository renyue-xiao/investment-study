const prefix = 'investment-study-' + self.registration.scope + '-';
const cacheName = prefix + 'BUILD_CACHE_KEY';
const files = BUILD_FILES;
const appRoot = new URL('./', self.registration.scope).href;
const assets = new Set(files.map((file) => new URL(file, appRoot).href));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) =>
    cache.addAll(files.map((file) => new Request(new URL(file, appRoot), { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(prefix) && key !== cacheName)
      .map((key) => caches.delete(key)))),
  ]));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(appRoot)) return;
  if (request.mode === 'navigate') {
    const path = new URL(request.url).pathname;
    const rootPath = new URL(appRoot).pathname;
    if (path !== rootPath && path !== rootPath + 'index.html') return;
    event.respondWith(caches.open(cacheName).then(async (cache) =>
      await cache.match(appRoot) || fetch(request)));
    return;
  }

  if (assets.has(request.url)) {
    event.respondWith(caches.open(cacheName).then(async (cache) =>
      await cache.match(request) || fetch(request)));
  }
});
