// Service worker: lets the installed game start and play with no connection.
//
// Own files: network first, so a new version shows up as soon as the phone is online, with the
// cached copy as the fallback when it is not (or when the network hangs for more than 4 seconds).
// Nothing comes from another host: three.js and the font are packed with the game (vendor/, fonts/).
//
// PRECACHE must list every file the game loads; tests/pwa.test.mjs fails if one is missing.
const VERSION = 'v21';
const SHELL = 'lumber-shell-' + VERSION;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/fonts.css',
  'fonts/inter-latin.woff2',
  'fonts/inter-latin-ext.woff2',
  'vendor/three.module.js',
  'css/platform.css',
  'js/main.js',
  'js/errors.js',
  'js/fences.js',
  'js/notice.js',
  'js/account.js',
  'js/account-ui.js',
  'js/area.js',
  'js/audio.js',
  'js/characters.js',
  'js/cloud.js',
  'js/config.js',
  'js/format.js',
  'js/fx.js',
  'js/guide.js',
  'js/hq.js',
  'js/hud.js',
  'js/input.js',
  'js/items3d.js',
  'js/labels.js',
  'js/loading.js',
  'js/particles.js',
  'js/pwa.js',
  'js/pwa-detect.js',
  'js/files.js',
  'js/native.js',
  'js/settings.js',
  'js/settings-logic.js',
  'js/sky.js',
  'js/stations.js',
  'js/textures.js',
  'js/trucks.js',
  'js/tutorial.js',
  'js/ui-logic.js',
  'js/world.js',
  'js/yard-ui.js',
  'js/data/areas.js',
  'js/data/balance.js',
  'js/data/company.js',
  'js/data/looks.js',
  'js/icons.js',
  'js/data/tuning.js',
  'js/sim/advice.js',
  'js/sim/backup.js',
  'js/sim/company.js',
  'js/sim/economy.js',
  'js/sim/hqview.js',
  'js/sim/jobs.js',
  'js/sim/market.js',
  'js/sim/offline.js',
  'js/sim/processor.js',
  'js/sim/series.js',
  'js/sim/sync.js',
  // the yard itself, in 3D (list C of the hundred)
  'js/customers.js',
  'js/models.js',
  'js/scenery.js',
  'js/view.js',
  'js/yardlife.js',
  'js/zoom.js',
  'js/sim/yard.js',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('lumber-') && name !== SHELL) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

const timeout = ms => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(request), timeout(4000)]);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    // Accounts and the admin portal are live data: never answered from the cache.
    const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
    if (path.startsWith('api/') || path.startsWith('admin')) return;
    event.respondWith(networkFirst(request));
  }
});
