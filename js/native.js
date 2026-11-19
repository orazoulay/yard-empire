// @ts-check
// The game inside its Android app (mobile/, built with Capacitor). A browser tab does these by itself;
// an app has to be told: what the phone's Back button does, and that the buttons for installing and for
// going fullscreen have no meaning here. In a browser this file does nothing.
import { isNativeApp } from './pwa-detect.js';
import { APP_LINK, readLink } from './cloud.js';
import { showNotice } from './notice.js';
import { updater as appUpdater } from './update.js';

const SEEN_KEY = 'yard-empire-link-seen';   // a mark of the last link taken (never the link itself), so that it is taken once

/** What is open right now, as one string: if Back changes it, Back did something. */
function opened(game) {
  return [game.ui.bare, game.hud.sheets.length, game.hqOpen, !!game.hq.nameBox, game.account.open,
    document.querySelectorAll('[role="dialog"]:not([hidden])').length].join();
}

/**
 * The phone's Back button: close what is on top, the way the Escape key does on a computer.
 * @returns false when nothing was open to close (the caller then leaves the app in the background)
 */
export function goBack(game) {
  const before = opened(game);
  const top = game.hq.nameBox || document.body;
  // A field that still has the cursor would keep the key for itself; Back means "leave this", so let go of it first.
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
  top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  return opened(game) !== before;
}

/** A short mark of a text, to know it again without keeping it. */
function markOf(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33 ^ text.charCodeAt(i)) >>> 0;
  return text.length + '.' + h.toString(36);
}

/**
 * A link from an email opened the app (APP_LINK, js/cloud.js). What it carried is put in the page's address and the
 * game starts over, so that it is read exactly as in a browser, where the link opens the game's page: js/cloud.js
 * takes the pass only on the device that signed up with that email, and the account opens as on any start.
 * What was played is saved first. The phone goes on naming the link the app was opened with after that start, so a
 * mark of the last link is kept and the same link is not taken twice; where nothing can be kept, no link is taken.
 * @param url   the address the phone opened the app with
 * @param deps  { game, win, storage }: replaced in tests
 * @returns true when the game was started over with the link
 */
export function takeLink(url, { game, win = globalThis, storage = win.localStorage } = {}) {
  const text = String(url ?? '');
  if (!text.startsWith(APP_LINK)) return false;
  const rest = text.slice(APP_LINK.length).replace(/^\//, '');
  if (!/^[?#]/.test(rest)) return false;   // another address that only begins the same way, or nothing after it
  const at = rest.indexOf('#'), search = at < 0 ? rest : rest.slice(0, at), hash = at < 0 ? '' : rest.slice(at);
  if (!readLink(hash, search)) return false;
  const mark = markOf(text);
  try {
    if (storage.getItem(SEEN_KEY) === mark) return false;
    storage.setItem(SEEN_KEY, mark);
  } catch { return false; }
  try { game?.save?.(); } catch { /* the account still opens; the game saves again when it can */ }
  win.history.replaceState(win.history.state, '', win.location.pathname + search + hash);
  win.location.reload();
  return true;
}

/** Links that open the app: the one it was opened with, and those that arrive while it is open. */
export function watchLinks(app, deps) {
  app?.addListener?.('appUrlOpen', e => { takeLink(e?.url, deps); });
  try { Promise.resolve(app?.getLaunchUrl?.()).then(r => { takeLink(r?.url, deps); }, () => {}); } catch { /* an app built without the plugin */ }
}

/**
 * The app's own updater (js/update.js): the game has started, so new files on trial are kept from here on; and
 * when a new version has been fetched from the site, the status line offers it, as it does in a browser. A player
 * who does not press Restart gets the new version at the next start of the app.
 */
export function watchUpdates(game, updater = appUpdater, notice = showNotice) {
  if (!updater) return false;
  updater.onReady = () => notice('update', {
    text: 'A new version is ready', action: 'Restart', tone: 'gold', priority: 2,
    onAction: () => {
      try { game?.save?.(); } catch { /* restart anyway: the game saves again when it can */ }
      updater.apply();
    },
  });
  if (updater.ready) updater.onReady(updater.ready);
  Promise.resolve(updater.confirm()).catch(() => {});
  return true;
}

export function initNative(game, win = globalThis) {
  if (!isNativeApp(win)) return false;
  document.documentElement.classList.add('native');   // css/style.css hides what belongs to a browser
  const app = win.Capacitor.Plugins?.App;
  // Back with nothing open puts the app in the background, as the Home button does. The game is saved when
  // the page is hidden (js/main.js), so nothing is lost either way.
  app?.addListener?.('backButton', () => { if (!goBack(game)) app.minimizeApp?.(); });
  watchLinks(app, { game, win });
  watchUpdates(game);
  return true;
}
