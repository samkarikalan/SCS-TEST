// SCS_BUILD_50_MYHUB_EMBEDDED_CLUBS_REPORT
/* Sports Club Scheduler service worker — complete installed-app updates. */
const CACHE_NAME = 'scs-cache-V168';
const APP_SHELL = './index.html?v=V168';

const ASSETS = [
  APP_SHELL,
  './ui.css?v=V168', './rounds.css?v=V168',
  './shared-match-center.js?v=V168', './group-tournament.js?v=V168', './group-tournament.css?v=V168', './tournament-bracket.js?v=V168', './tournament-bracket.css?v=V168', './scoring.js?v=V168', './court-center.js?v=V168', './offline-db.js?v=V168', './offline-rounds.js?v=V168', './full-schedule.js?v=V168', './snapshot.js?v=V168', './supabase.js?v=V168', './auth.js?v=V168',
  './authUI.js?v=V168', './subscription.js?v=V168', './HomeScreen.js?v=V168',
  './engjap.js?v=V168', './main.js?v=V168', './games.js?v=V168',
  './rounds.js?v=V168', './mbm.js?v=V168', './players.js?v=V168',
  './importPlayers.js?v=V168', './settings.js?v=V168', './summary.js?v=V168',
  './help.js?v=V168', './profile.js?v=V168', './dashboard.js?v=V168',
  './slots.js?v=V168', './notifications.js?v=V168', './viewer.js?v=V168',
  './report.js?v=V168', './manifest.json?v=V168',
  './male.png?v=V168', './female.png?v=V168', './win-cup.png?v=V168',
  './welcome-default-myhub.png?v=V168', './welcome-default-round-manager.png?v=V168', './welcome-default-slot-manager.png?v=V168',
  './lock.png?v=V168', './unlock.png?v=V168', './icon-192.png?v=V168',
  './icon-512.png?v=V168', './clubs-brand.png?v=V168', './google-g.svg?v=V168', './help_en.json?v=V168', './help_jp.json?v=V168',
  './help_kr.json?v=V168', './help_zh.json?v=V168', './help_vi.json?v=V168'
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
