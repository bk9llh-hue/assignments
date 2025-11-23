const CACHE_NAME = 'proxy-cache-v1';
const urlsToCache = [
    '/',             // cache homepage
    '/browser.html', // your main browser page
    '/sw.js'         // service worker itself
];

// Install: cache core files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

// Fetch: serve cached files first, fallback to network
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Only handle same-origin
    if(url.origin === location.origin){
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    // Cache new files dynamically
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
            }).catch(()=> new Response('', {status: 503, statusText:'Service Unavailable'}))
        );
    }else{
        // For cross-origin requests, just fetch normally
        event.respondWith(fetch(event.request));
    }
});
