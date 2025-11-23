const CACHE_NAME = 'smart-browser-v1';
const urlsToCache = [
    '/',
    '/browser.html',
    '/index.html'
];

self.addEventListener('install', e=>{
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache=>cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', e=>{
    e.respondWith(
        caches.match(e.request).then(response=>{
            return response || fetch(e.request);
        })
    );
});

self.addEventListener('activate', e=>{
    e.waitUntil(
        caches.keys().then(keys=>Promise.all(
            keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))
        ))
    );
});
