// sw.js - simple service worker
const CACHE = 'classroom-proxy-v1';
const ASSETS = ['/', '/browser.html', '/home.html'];
self.addEventListener('install', (e) => {
e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
self.skipWaiting();
});
self.addEventListener('activate', (e) => {
e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e) => {
const url = new URL(e.request.url);
if (url.pathname === '/' || url.pathname === '/browser.html' || url.pathname === '/home.html') {
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
return;
}
e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
