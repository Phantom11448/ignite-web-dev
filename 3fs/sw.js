// 3FS Service Worker — v1.4
// © 2026 IgniteWebDev. All Rights Reserved.
const CACHE_NAME = '3fs-v38';
const ASSETS = [
  './index.html',
  './styles.css',
  './game.js',
  './profiles.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './bar-scene-mobile.png',
  './bar-scene-wide.png',
  './table-top.png',
  './3fstitle.png',
  './coin-heads.png',
  './coin-tails.png',
  './winner-wooch.mp4',
  './winner-phantom.mp4',
  './winner-hustler.mp4',
  './winner-bartender.mp4',
  './winner-biker.mp4',
  './winner-punk.mp4',
  './winner-highroller.mp4',
  './winner-femme-fatale.mp4',
  './btn-enter-bar.png',
  './btn-deal-em.png',
  './btn-join-room.png',
  './btn-create-room.png',
  './btn-play-card.png',
  './btn-lock-in.png',
  './btn-play-again.png',
  './btn-quit.png',
  './avatar-wooch.png',
  './avatar-phantom.png',
  './avatar-hustler.png',
  './avatar-biker.png',
  './avatar-highroller.png',
  './avatar-punk.png',
  './avatar-femme-fatale.png',
  './avatar-bartender.png',
  './intro.mp4'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic') ||
      url.hostname.includes('fonts.') ||
      url.pathname.endsWith('.mp4')) {
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});