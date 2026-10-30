// SCS_BUILD_50_MYHUB_EMBEDDED_CLUBS_REPORT
/* Sports Club Scheduler service worker — complete installed-app updates. */
const CACHE_NAME = 'scs-cache-V519';
const APP_SHELL = './index.html?v=V519';

const ASSETS = [
  APP_SHELL,
  './scs-practice-card-pro.png', './scs-tournament-card-pro.png', './scs-practice-card-textfree.png', './scs-tournament-card-textfree.png',
  './ui.css?v=V149', './rounds.css?v=V149',
  './shared-court-popup.js?v=V398', './shared-court-popup.css?v=V398', './scs-api.js?v=V434', './team-tournament.js?v=V411', './team-tournament.css?v=V481', './shared-match-card.css?v=V395', './shared-match-center.js?v=V395', './group-tournament.js?v=V480', './group-tournament.css?v=V480', './tournament-team-picker.js?v=V402', './tournament-players-page.js?v=V403', './tournament-bracket.js?v=V454', './tournament-bracket.css?v=V454', './scoring.js?v=V367', './court-center.js?v=V406', './offline-db.js?v=V149', './offline-rounds.js?v=V149', './full-schedule.js?v=V149', './snapshot.js?v=V149', './supabase.js?v=V411', './auth.js?v=V149',
  './authUI.js?v=V149', './subscription.js?v=V149', './HomeScreen.js?v=V269',
  './engjap.js?v=V149', './main.js?v=V519', './games.js?v=V149',
  './rounds.js?v=V149', './mbm.js?v=V149', './players.js?v=V149',
  './importPlayers.js?v=V149', './settings.js?v=V236', './summary.js?v=V149',
  './help.js?v=V149', './profile.js?v=V149', './dashboard.js?v=V149',
  './slots.js?v=V149', './notifications.js?v=V149', './viewer.js?v=V149',
  './report.js?v=V149', './manifest.json?v=V209',
  './male.png?v=V149', './female.png?v=V149', './win-cup.png?v=V149',
  './welcome-default-myhub.png?v=V149', './welcome-default-round-manager.png?v=V149', './welcome-default-slot-manager.png?v=V149',
  './lock.png?v=V149', './unlock.png?v=V149', './icon-192.png?v=V149',
  './icon-512.png?v=V149', './clubs-brand.png?v=V149', './google-g.svg?v=V149', './help_en.json?v=V149', './help_jp.json?v=V149',
  './help_kr.json?v=V149', './help_zh.json?v=V149', './help_vi.json?v=V149'
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
