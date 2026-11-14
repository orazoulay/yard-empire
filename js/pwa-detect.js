// @ts-check
// Pure checks used by the install UI, kept apart from the browser calls so they can be tested.

/** iPhone, iPod, or iPad. Recent iPads report themselves as a Mac, but only they have a touch screen. */
export function isIos({ userAgent = '', platform = '', maxTouchPoints = 0 }) {
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/** True when the game was opened from the home screen rather than in a browser tab. */
export function isStandalone(nav, matches) {
  return nav.standalone === true || matches('(display-mode: standalone)') || matches('(display-mode: fullscreen)');
}

/** True inside the Android app (mobile/): Capacitor puts itself on the window before the page's scripts run. */
export function isNativeApp(win = globalThis) {
  try { return win?.Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}

/** The shell version written in sw.js (`const VERSION = 'v9'`), or null if the text is not our service worker. */
export function shellVersion(swText) {
  const m = /const VERSION = '([^']+)'/.exec(String(swText || ''));
  return m ? m[1] : null;
}

/** version.json as tools/make_version.py writes it, or null for a missing or foreign file. Only the known fields are kept. */
export function readVersion(data) {
  if (!data || typeof data !== 'object' || typeof data.commit !== 'string' || !/^[0-9a-f]{4,40}$/.test(data.commit)) return null;
  return { commit: data.commit, date: typeof data.date === 'string' ? data.date.slice(0, 40) : '', dirty: data.dirty === true };
}

/**
 * True when the server now has a different game than the one this page loaded.
 * `loaded` and `now` are { shell, commit }; a side that is unknown (offline, no version file) never counts as a change.
 */
export function isNewVersion(loaded, now) {
  const differs = (a, b) => a != null && b != null && a !== b;
  return differs(loaded.shell, now.shell) || differs(loaded.commit, now.commit);
}

export const CONNECTION_TEXT = {
  offline: 'You are offline. Progress is kept on this device.',
  unreachable: 'No connection to the server. Progress is kept on this device.',
  back: 'Back online.',
  saved: 'Back online. Progress saved to your account.',
};

/**
 * What the status line says about the connection. `state` is 'up', 'offline', 'unreachable' or 'waiting'
 * (back online, the first upload not yet through). Events: 'offline', 'online' (with `signedIn`), and how an
 * upload of the save went: 'sync-ok' or 'sync-failed'. Returns the next state and which CONNECTION_TEXT to
 * show; null means leave the line as it is. "Saved" is only ever said after an upload really went through.
 */
export function nextConnection(state, event, signedIn = false) {
  switch (event) {
    case 'offline': return { state: 'offline', say: state === 'offline' ? null : 'offline' };
    case 'online':
      if (state !== 'offline') return { state, say: null };
      return { state: signedIn ? 'waiting' : 'up', say: 'back' };
    case 'sync-failed':
      if (state === 'up' || state === 'waiting') return { state: 'unreachable', say: 'unreachable' };
      return { state, say: null };
    case 'sync-ok': return { state: 'up', say: state === 'up' ? null : 'saved' };
    default: return { state, say: null };
  }
}
