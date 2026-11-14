// Service worker: lets the installed game start and play with no connection.
//
// Own files: network first, so a new version shows up as soon as the phone is online, with the
// cached copy as the fallback when it is not (or when the network hangs for more than 4 seconds).
// Nothing comes from another host: three.js and the font are packed with the game (vendor/, fonts/).
//
// VERSION and PRECACHE are written by tools/make_precache.py: run it after adding, removing or changing a file
// (tests/pwa.test.mjs fails when they are out of date). tools/make_site.py runs it on the folder it publishes.
const VERSION = 'v169896946187';
const SHELL = 'lumber-shell-' + VERSION;

const PRECACHE = [
  './',
  'css/fonts.css',
  'css/platform.css',
  'css/style.css',
  'fonts/inter-latin-ext.woff2',
  'fonts/inter-latin.woff2',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'index.html',
  'js/account-ui.js',
  'js/account.js',
  'js/area.js',
  'js/audio.js',
  'js/builders.js',
  'js/characters.js',
  'js/cloud.js',
  'js/config.js',
  'js/credits-ui.js',
  'js/credits.js',
  'js/customers.js',
  'js/data/areas.js',
  'js/data/balance.js',
  'js/data/builds.js',
  'js/data/company.js',
  'js/data/credits.js',
  'js/data/help.js',
  'js/data/looks.js',
  'js/data/stories.js',
  'js/data/tuning.js',
  'js/engine/bake.js',
  'js/engine/materials.js',
  'js/engine/perf.js',
  'js/engine/quality.js',
  'js/engine/renderer.js',
  'js/errors.js',
  'js/fences.js',
  'js/files.js',
  'js/format.js',
  'js/fx.js',
  'js/gfx/kit.js',
  'js/gfx/machines.js',
  'js/gfx/products.js',
  'js/guide.js',
  'js/hq.js',
  'js/hq/advisor.js',
  'js/hq/build.js',
  'js/hq/businesses.js',
  'js/hq/contracts.js',
  'js/hq/finance.js',
  'js/hq/goals.js',
  'js/hq/help.js',
  'js/hq/kit.js',
  'js/hq/logistics.js',
  'js/hq/market.js',
  'js/hq/overview.js',
  'js/hq/patch.js',
  'js/hq/people.js',
  'js/hq/records.js',
  'js/hq/research.js',
  'js/hud.js',
  'js/icons.js',
  'js/input.js',
  'js/items3d.js',
  'js/labels.js',
  'js/loading.js',
  'js/main.js',
  'js/models.js',
  'js/native.js',
  'js/notice.js',
  'js/particles.js',
  'js/pets.js',
  'js/pwa-detect.js',
  'js/pwa.js',
  'js/scenery.js',
  'js/settings-logic.js',
  'js/settings.js',
  'js/sim/advice.js',
  'js/sim/backup.js',
  'js/sim/company.js',
  'js/sim/economy.js',
  'js/sim/helpers.js',
  'js/sim/hqview.js',
  'js/sim/jobs.js',
  'js/sim/market.js',
  'js/sim/offline.js',
  'js/sim/processor.js',
  'js/sim/series.js',
  'js/sim/site.js',
  'js/sim/stories.js',
  'js/sim/sync.js',
  'js/sim/yard.js',
  'js/site.js',
  'js/sky.js',
  'js/stations.js',
  'js/textures.js',
  'js/trucks.js',
  'js/tutorial.js',
  'js/ui-logic.js',
  'js/view.js',
  'js/world.js',
  'js/yard-ui.js',
  'js/yardlife.js',
  'js/zoom.js',
  'manifest.webmanifest',
  'vendor/three.module.min.js',
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

async function networkFirst(event, request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(request), timeout(4000)]);
    // Only whole, plain answers are kept: not a 206 (cache.put rejects it), not a redirect or an error page, and
    // not anything the server marked private or no-store.
    if (res.status === 200 && res.type === 'basic' && !/no-store|private/i.test(res.headers.get('cache-control') || '')) {
      event.waitUntil(cache.put(request, res.clone()).catch(() => {}));
    }
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
    // Also when the game sits below a path (scope /yard-empire/) and the address is the host's own /api/...
    const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
    if (/^(?:api|admin)(?:\/|$)/.test(path) || /^\/(?:api|admin)(?:\/|$)/.test(url.pathname)) return;
    // A request that carries credentials of its own is never kept, and a range request is the media element's business.
    if (request.headers.has('authorization') || request.headers.has('range')) return;
    event.respondWith(networkFirst(event, request));
  }
});
