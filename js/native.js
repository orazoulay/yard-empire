// The game inside its Android app (mobile/, built with Capacitor). A browser tab does these by itself;
// an app has to be told: what the phone's Back button does, and that the buttons for installing and for
// going fullscreen have no meaning here. In a browser this file does nothing.
import { isNativeApp } from './pwa-detect.js';

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

export function initNative(game, win = globalThis) {
  if (!isNativeApp(win)) return false;
  document.documentElement.classList.add('native');   // css/style.css hides what belongs to a browser
  const app = win.Capacitor.Plugins?.App;
  // Back with nothing open puts the app in the background, as the Home button does. The game is saved when
  // the page is hidden (js/main.js), so nothing is lost either way.
  app?.addListener?.('backButton', () => { if (!goBack(game)) app.minimizeApp?.(); });
  return true;
}
