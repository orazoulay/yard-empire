// Phone install support and the game's link to its server: registers the offline service worker, offers an
// install button where the browser allows one, explains the manual steps on iPhone, keeps the screen awake
// while playing, and tells the player through the status line (js/notice.js) when a new version is ready
// and when the connection goes and comes back.
import { isIos, isStandalone, isNativeApp, shellVersion, readVersion, isNewVersion, CONNECTION_TEXT, nextConnection } from './pwa-detect.js';
import { showNotice } from './notice.js';

const $ = id => document.getElementById(id);
const CHECK_EVERY = 15 * 60 * 1000;   // how often an open game asks the server whether it has changed
const CHECK_GAP = 60 * 1000;          // coming back to the tab asks too, but not more often than this

export function initPwa() {
  const native = isNativeApp();   // inside the Android app the files are on the device: nothing to keep, nothing to install
  const installed = native || isStandalone(navigator, q => matchMedia(q).matches);

  // Offline support. Service workers only run on https or localhost.
  if (!native && 'serviceWorker' in navigator && isSecureContext) {
    const register = () => navigator.serviceWorker.register('sw.js').catch(() => { /* play online only */ });
    // The game now starts after the account check, which can be later than the page's load event.
    if (document.readyState === 'complete') register(); else addEventListener('load', register);
  }

  watchVersion();
  watchConnection();

  // Android and desktop Chrome hand us an install prompt to show when we choose.
  const btn = $('btn-install');
  if (btn) {
    let prompt = null;
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; btn.hidden = false; });
    btn.addEventListener('click', async () => {
      if (!prompt) return;
      prompt.prompt();
      await prompt.userChoice.catch(() => {});
      prompt = null; btn.hidden = true;
    });
    addEventListener('appinstalled', () => { prompt = null; btn.hidden = true; });
  }

  // iPhone has no install prompt: the player has to use the Share menu.
  const steps = $('ios-install');
  if (steps && isIos(navigator) && !installed) steps.hidden = false;

  keepAwake();
}

/** What the server has now. Each part is null when it cannot be known: no connection, or no version.json. */
async function serverVersion() {
  // no-cache: ask the server every time, which costs a short 304 when nothing changed. Without a connection the
  // service worker answers with the copy it kept, which is the version this page's own files came from.
  const get = async (url, parse) => {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      return res.ok ? await parse(res) : null;
    } catch { return null; }
  };
  const [shell, version] = await Promise.all([
    isNativeApp() ? null : get('sw.js', async res => shellVersion(await res.text())),   // the app has no service worker file
    get('version.json', async res => readVersion(await res.json().catch(() => null))),
  ]);
  return { shell, version, commit: version ? version.commit : null };
}

/**
 * An open game keeps running the code it started with: an installed one can stay open for days. Remember what
 * the server had when this page loaded, look again now and then, and offer a reload when it differs.
 * Also sets window.yardEmpireVersion ({ commit, date, dirty } or null) for the settings sheet to show.
 */
function watchVersion() {
  window.yardEmpireVersion = null;
  let loaded = null, asked = 0, ready = false, busy = false;
  const check = async () => {
    if (ready || busy) return;
    if (loaded && (document.hidden || navigator.onLine === false || Date.now() - asked < CHECK_GAP)) return;
    busy = true; asked = Date.now();
    const now = await serverVersion();
    busy = false;
    if (!loaded) { loaded = now; window.yardEmpireVersion = now.version; return; }
    // A part that could not be read at the start is learned once it can be; it cannot count as a change.
    loaded = { shell: loaded.shell ?? now.shell, commit: loaded.commit ?? now.commit };
    if (!isNewVersion(loaded, now)) return;
    ready = true;
    showNotice('update', {
      text: 'A new version is ready', action: 'Reload', tone: 'gold', priority: 2,
      onAction: () => {
        try { window.game?.save?.(); } catch { /* reload anyway */ }
        location.reload();
      },
    });
  };
  check();
  document.addEventListener('visibilitychange', check);
  setInterval(check, CHECK_EVERY);
}

/** Say when the game is offline and when it is back. js/account.js reports each upload of the save as a "yard:sync" event. */
function watchConnection() {
  let state = 'up', uploads = false;   // uploads: this player's progress goes to an account
  const on = event => {
    const next = nextConnection(state, event, uploads);
    state = next.state;
    if (!next.say) return;
    const lasting = next.say === 'offline' || next.say === 'unreachable';
    showNotice('connection', { text: CONNECTION_TEXT[next.say], tone: lasting ? 'muted' : '', priority: 1, seconds: lasting ? 0 : 4 });
  };
  if (navigator.onLine === false) on('offline');
  addEventListener('offline', () => on('offline'));
  addEventListener('online', () => on('online'));
  addEventListener('yard:sync', e => { uploads = true; on(e.detail && e.detail.ok ? 'sync-ok' : 'sync-failed'); });
}

/** An idle game is mostly watched, so stop the phone from dimming. Released by the browser when the tab hides. */
function keepAwake() {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const request = async () => {
    if (lock || document.visibilityState !== 'visible') return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { /* low battery or not allowed */ }
  };
  addEventListener('pointerdown', request, { passive: true });
  document.addEventListener('visibilitychange', request);
}
