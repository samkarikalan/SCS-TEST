// SCS_BUILD_50_MYHUB_EMBEDDED_CLUBS_REPORT
/* Sports Club Scheduler service worker — complete installed-app updates. */
const CACHE_NAME = 'scs-cache-V167';
const APP_SHELL = './index.html?v=V167';

const ASSETS = [
  APP_SHELL,
  './ui.css?v=V167', './rounds.css?v=V167',
  './shared-match-center.js?v=V167', './group-tournament.js?v=V167', './group-tournament.css?v=V167', './tournament-bracket.js?v=V167', './tournament-bracket.css?v=V167', './scoring.js?v=V167', './court-center.js?v=V167', './offline-db.js?v=V167', './offline-rounds.js?v=V167', './full-schedule.js?v=V167', './snapshot.js?v=V167', './supabase.js?v=V167', './auth.js?v=V167',
  './authUI.js?v=V167', './subscription.js?v=V167', './HomeScreen.js?v=V167',
  './engjap.js?v=V167', './main.js?v=V167', './games.js?v=V167',
  './rounds.js?v=V167', './mbm.js?v=V167', './players.js?v=V167',
  './importPlayers.js?v=V167', './settings.js?v=V167', './summary.js?v=V167',
  './help.js?v=V167', './profile.js?v=V167', './dashboard.js?v=V167',
  './slots.js?v=V167', './notifications.js?v=V167', './viewer.js?v=V167',
  './report.js?v=V167', './manifest.json?v=V167',
  './male.png?v=V167', './female.png?v=V167', './win-cup.png?v=V167',
  './welcome-default-myhub.png?v=V167', './welcome-default-round-manager.png?v=V167', './welcome-default-slot-manager.png?v=V167',
  './lock.png?v=V167', './unlock.png?v=V167', './icon-192.png?v=V167',
  './icon-512.png?v=V167', './clubs-brand.png?v=V167', './google-g.svg?v=V167', './help_en.json?v=V167', './help_jp.json?v=V167',
  './help_kr.json?v=V167', './help_zh.json?v=V167', './help_vi.json?v=V167'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Keep the app shell required; a transient failure for one optional asset
      // must not prevent a first-time Android service worker from installing.
      return fetch(new Request(APP_SHELL, { cache: 'reload' })).then(function(response) {
        if (!response || !response.ok) throw new Error('App shell HTTP ' + (response && response.status));
        return cache.put(APP_SHELL, response);
      }).then(function() { return Promise.all(ASSETS.filter(function(url) { return url !== APP_SHELL; }).map(function(url) {
        return fetch(new Request(url, { cache: 'reload' })).then(function(response) {
          if (!response || !response.ok) return;
          return cache.put(url, response);
        }).catch(function() {});
      })); });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(key) { return key !== CACHE_NAME; })
        .map(function(key) { return caches.delete(key); }));
    }).then(function() { return self.clients.claim(); })
  );
});

function isApiRequest(url) {
  return url.includes('supabase.co') || url.includes('workers.dev') ||
    url.includes('/db/') || url.includes('/auth/') || url.includes('/sub/') ||
    url.includes('/generate-round');
}

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET' || isApiRequest(event.request.url)) return;
  const isNavigation = event.request.mode === 'navigate';

  event.respondWith((async function() {
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(isNavigation ? APP_SHELL : event.request, response.clone());
      }
      return response;
    } catch (error) {
      if (isNavigation) return (await caches.match(APP_SHELL)) || Response.error();
      return (await caches.match(event.request)) ||
        (await caches.match(event.request, { ignoreSearch: true })) ||
        Response.error();
    }
  })());
});
