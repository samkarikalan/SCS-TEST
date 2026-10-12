// SCS_BUILD_50_MYHUB_EMBEDDED_CLUBS_REPORT
/* Sports Club Scheduler service worker — complete installed-app updates. */
const CACHE_NAME = 'scs-cache-V169';
const APP_SHELL = './index.html?v=V169';

const ASSETS = [
  APP_SHELL,
  './ui.css?v=V169', './rounds.css?v=V169',
  './shared-match-center.js?v=V169', './group-tournament.js?v=V169', './group-tournament.css?v=V169', './tournament-bracket.js?v=V169', './tournament-bracket.css?v=V169', './scoring.js?v=V169', './court-center.js?v=V169', './offline-db.js?v=V169', './offline-rounds.js?v=V169', './full-schedule.js?v=V169', './snapshot.js?v=V169', './supabase.js?v=V169', './auth.js?v=V169',
  './authUI.js?v=V169', './subscription.js?v=V169', './HomeScreen.js?v=V169',
  './engjap.js?v=V169', './main.js?v=V169', './games.js?v=V169',
  './rounds.js?v=V169', './mbm.js?v=V169', './players.js?v=V169',
  './importPlayers.js?v=V169', './settings.js?v=V169', './summary.js?v=V169',
  './help.js?v=V169', './profile.js?v=V169', './dashboard.js?v=V169',
  './slots.js?v=V169', './notifications.js?v=V169', './viewer.js?v=V169',
  './report.js?v=V169', './manifest.json?v=V169',
  './male.png?v=V169', './female.png?v=V169', './win-cup.png?v=V169',
  './welcome-default-myhub.png?v=V169', './welcome-default-round-manager.png?v=V169', './welcome-default-slot-manager.png?v=V169',
  './lock.png?v=V169', './unlock.png?v=V169', './icon-192.png?v=V169',
  './icon-512.png?v=V169', './clubs-brand.png?v=V169', './google-g.svg?v=V169', './help_en.json?v=V169', './help_jp.json?v=V169',
  './help_kr.json?v=V169', './help_zh.json?v=V169', './help_vi.json?v=V169'
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
