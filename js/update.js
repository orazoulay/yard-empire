// @ts-check
// The Android app takes new game files from the site, so a push to the site reaches the app without a new
// bundle on Google Play. In a browser this file does nothing: there the service worker (sw.js) does the same job.
//
// The app carries its own copy of the game (mobile/www) and always can start from it. Each set of files has a
// list, files.json: every file with its SHA-256, and a version made from all of them (tools/make_app.py). The
// site has the same list for the files it holds now (app/files.json, tools/make_site.py --game). When the two
// versions differ, the app builds a whole new folder in its own storage: files that did not change are copied
// from the set it runs, the others come from the site, and each is checked against the list before it is
// written. Then Capacitor is asked to serve the game from that folder: the address stays https://localhost, so
// the save and the sign-in are where they were.
//
// A new folder is first tried, not trusted: it is served without being remembered. Only when the game has
// started from it is Capacitor told to remember it. If its files do not load within ten seconds, or the start
// throws an error, the app marks that version as failed on this phone and goes back to the files that worked.
// If the files are too broken for that guard to run at all, nothing was remembered: the next start of the app
// is from the old files, and after two such starts the version is marked failed too.
//
// Files that were kept and later stop starting are another matter: nothing says which older set would do better.
// The app does not go back then, but after half a minute without a game it asks the site by itself, and uses a
// version it finds there at once. So a fix that is pushed reaches even an app whose game no longer starts.
//
// This file imports nothing and the page loads it with a script tag of its own, ahead of the game (index.html),
// so the guard is already running when a broken file of the game fails to load.
// Design: docs/superpowers/specs/2026-11-19-app-live-update-design.md. How to run it on the test phone: mobile/README.md.

/** Where the app reads its files from: the game's site, in the folder tools/make_site.py --game writes. Empty: the app never updates itself. */
export const APP_FILES = 'https://orazoulay.github.io/yard-empire/app/';

export const NOTES_KEY = 'yard-empire-update';         // localStorage: what was fetched, what works, what failed
export const TRIAL_KEY = 'yard-empire-update-trial';   // sessionStorage: the version this run of the app is trying
const FOLDER = 'update';          // in the app's private files: update/<version>/
const TRIES = 'tries.json';       // in that folder: how often the waiting version was tried, kept where a crash cannot lose it
const LOAD_MS = 10000;            // a new set whose files have not loaded by then is not going to
const STUCK_MS = 30000;           // a game that has not started by then is asked about no longer: the site is
const SWITCH_MS = 8000;           // how long the old page waits to be replaced after asking for another folder
const MAX_TRIES = 2;              // starts of a try that ended with the app closed, before the version is given up
const GAP_MS = 60 * 1000;         // the site is not asked more often than this
const RETRY_MS = 10 * 60 * 1000;  // after a download that failed (the site's own cache keeps a file for ten minutes)
const FIRST_MS = 5000, EVERY_MS = 15 * 60 * 1000;   // when an open game asks: soon after the start, on coming back, and now and then
const POOL = 4;                   // files in flight at once
const MAX_FILES = 2000, MAX_BAD = 20;
const PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;   // the same rule as tools/make_app.py
const VERSION = /^v\d{1,20}$/;
const MARK = /^[0-9a-f]{64}$/;

/**
 * A list of files as the tools write it, or null for anything else. The list comes from the network and its
 * version and paths become folders and files on the phone, so one thing out of shape refuses the whole list.
 * @returns {{ version: string, minBuild: number, files: Record<string, string>, apart: string[] } | null}
 */
export function readList(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { version, minBuild, files, apart = [] } = data;
  if (typeof version !== 'string' || !VERSION.test(version)) return null;
  if (!Number.isInteger(minBuild) || minBuild < 1) return null;
  if (!files || typeof files !== 'object' || Array.isArray(files) || !Array.isArray(apart)) return null;
  const names = Object.keys(files);
  if (!names.length || names.length > MAX_FILES || !names.includes('index.html')) return null;
  for (const name of names) {
    if (!PATH.test(name) || name.split('/').some(part => part === '..' || part === '.') || name === 'files.json') return null;
    if (typeof files[name] !== 'string' || !MARK.test(files[name])) return null;
  }
  if (apart.some(name => typeof name !== 'string' || !names.includes(name))) return null;
  return { version, minBuild, files: { ...files }, apart: [...apart] };
}

/** True for an address on another site than the page's own. Where the page's address is not known, nothing is foreign. */
function foreign(src, home) {
  try { return !!home && new URL(src, home).origin !== home; } catch { return false; }
}

/**
 * Is this "error" or "unhandledrejection" event the game's own code breaking? A picture that did not load, a
 * request that did not get through and a sound the phone would not play are not: they must not send a good
 * version back. Nor is a script of another site that did not load (Google's sign-in file, js/google.js): `home` is
 * the page's own address, and where it is not known every script counts.
 */
export function isBreak(type, e, home = globalThis.location?.origin) {
  if (type === 'error') {
    const el = e?.target && e.target.tagName ? e.target : null;
    if (el) return el.tagName === 'SCRIPT' && !!el.src && !foreign(el.src, home);
    return e?.error instanceof Error;
  }
  const r = e?.reason;
  if (!r || typeof r.name !== 'string' || typeof r.message !== 'string') return false;
  if (r.name === 'SyntaxError' || r.name === 'ReferenceError') return true;
  return r.name === 'TypeError' && /module|import/i.test(r.message);
}

const blank = build => ({ build, good: null, goodPath: null, next: null, nextPath: null, tries: 0, bad: [] });

/** The notes as kept on the phone; anything unreadable or out of shape counts as no notes. */
function readNotes(storage) {
  let n = null;
  try { n = JSON.parse(storage.getItem(NOTES_KEY) || 'null'); } catch { /* no notes */ }
  if (!n || typeof n !== 'object') return blank(null);
  const version = v => (typeof v === 'string' && VERSION.test(v) ? v : null), path = p => (typeof p === 'string' && p ? p : null);
  const good = version(n.good), next = version(n.next);
  return {
    build: Number.isInteger(n.build) ? n.build : null,
    good: good && path(n.goodPath) ? good : null, goodPath: good ? path(n.goodPath) : null,
    next: next && path(n.nextPath) ? next : null, nextPath: next ? path(n.nextPath) : null,
    tries: Number.isInteger(n.tries) && n.tries > 0 ? n.tries : 0,
    bad: Array.isArray(n.bad) ? n.bad.filter(version).slice(-MAX_BAD) : [],
  };
}

/** Run `work` on every item, a few at a time. The first failure stops the rest from starting and is thrown. */
async function pool(items, size, work) {
  let at = 0, failed = null;
  const worker = async () => {
    while (at < items.length && !failed) {
      const item = items[at++];
      try { await work(item); } catch (e) { failed = failed || e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  if (failed) throw failed;
}

/**
 * The updater. `phone` is everything it needs from outside (storage, the network, the folder, Capacitor), so the
 * tests hand it a made-up one (tests/update.test.mjs); makePhone below is the real one.
 */
export class Updater {
  constructor(phone) {
    this.phone = phone;
    this.notes = readNotes(phone.storage);
    this.trial = null;        // the version this page is a try of
    this.confirmed = false;   // the game has started
    this.failed = false;
    this.stuck = false;       // the game has not started for a long while: only a version from the site can help
    this.busy = false;        // a question to the site is under way
    this.switching = false;   // Capacitor has been asked for another folder: the page is about to start over
    this.watching = false;
    this.asked = -Infinity; this.gaveUp = { version: null, at: 0 };
    this.problem = '';        // why the last download failed, for whoever looks (tools/bench/phone-update.mjs)
    this.ready = null;        // a fetched version that waits for a restart
    this.onReady = null;      // called with that version: the game shows the notice
    this.timer = null; this.unwatch = null;
    let trial = null;
    try { trial = phone.session.getItem(TRIAL_KEY); } catch { /* no session storage: no tries */ }
    if (trial && trial === this.notes.next) {
      this.trial = trial;
      this.timer = phone.timer.set(() => this.fail('slow'), LOAD_MS);
      this.unwatch = phone.watchErrors(() => this.fail('error'));
    } else {
      if (trial) this.forget();
      // Files that were kept long ago can stop starting too (a save they cannot read). Nothing goes back by itself
      // then, but the site is still asked, so a fix that is pushed reaches an app whose game no longer starts.
      this.timer = phone.timer.set(() => { this.rescue(); }, STUCK_MS);
    }
  }

  keep() { try { this.phone.storage.setItem(NOTES_KEY, JSON.stringify(this.notes)); return true; } catch { return false; } }
  forget() { try { this.phone.session.removeItem(TRIAL_KEY); } catch { /* nothing to forget */ } }
  /** Delete the count of tries kept in a file. Awaited before the folder is read: a file that goes while it is listed fails the listing. */
  uncount() { return Promise.resolve().then(() => this.phone.disk.setTries(null)).catch(() => {}); }
  disarm() {
    if (this.timer != null) this.phone.timer.clear(this.timer);
    this.timer = null;
  }

  /**
   * The game's files have loaded and it is about to start (js/main.js waits for this). On a start of the app with
   * a fetched version waiting, the page is replaced by that version and this never comes back in time to matter.
   */
  async start() {
    if (this.trial) { this.disarm(); return; }   // the files of the version on try loaded: its ten seconds are over
    let build = null;
    try { build = await this.phone.build(); } catch { /* an app that cannot say which it is does not update */ }
    if (!Number.isInteger(build)) return;
    const n = this.notes;
    if (n.build !== build) {   // the first start, or a new app from Google Play: Capacitor itself went back to the bundled copy
      this.notes = blank(build);
      this.keep();
      await this.uncount();
      return;
    }
    if (!n.next) return;
    let served = null;
    try { served = await this.phone.web.served(); } catch { /* unknown */ }
    if (served && served === n.nextPath) {
      // Capacitor already starts the app from this folder: it was remembered, and only the note of that was lost
      // (an app killed in the instant of the write). It is the version in use, not one to try or to give up.
      n.good = n.next; n.goodPath = n.nextPath; n.next = n.nextPath = null; n.tries = 0;
      this.keep();
      return;
    }
    await this.useNext();
  }

  async has(version) { try { return await this.phone.disk.has(version); } catch { return false; } }

  giveUp(version) {
    const n = this.notes;
    n.bad = [...n.bad.filter(v => v !== version), version].slice(-MAX_BAD);
    if (n.next === version) { n.next = n.nextPath = null; n.tries = 0; }
    this.ready = null;
    this.keep();
    return this.uncount();
  }

  /** The fetched version, if it may still be tried: serve it. Given up after two tries that ended with the app closed. */
  async useNext() {
    const n = this.notes;
    if (!n.next || this.switching) return;
    // The count is also kept in a file: the note in the page's storage reaches the disk only when the app leaves the
    // screen, and files that crash the app the moment they load would never let it get there.
    let counted = null;
    try { counted = await this.phone.disk.tries(); } catch { /* the note alone */ }
    if (counted && counted.version === n.next && Number.isInteger(counted.tries) && counted.tries > n.tries) n.tries = counted.tries;
    if (n.tries >= MAX_TRIES) {
      await this.giveUp(n.next);
      return;
    }
    if (!await this.has(n.next)) {   // notes without their folder: a phone restored from a backup
      n.next = n.nextPath = null; n.tries = 0;
      this.keep();
      return;
    }
    await this.tryNext();
  }

  /** Serve the fetched version, without remembering it. The page starts over from it; while it does, this waits. */
  async tryNext() {
    const n = this.notes;
    if (!n.next || !n.nextPath || this.switching) return;   // a second press of Restart is the same restart
    this.switching = true;
    n.tries += 1;
    try {
      if (!this.keep()) return;   // without notes a broken version would be tried for ever
      try { await this.phone.disk.setTries({ version: n.next, tries: n.tries }); } catch { /* the note alone */ }
      try {
        this.phone.session.setItem(TRIAL_KEY, n.next);
        await this.phone.web.serveFolder(n.nextPath);
      } catch { this.forget(); return; }
      await this.phone.timer.wait(SWITCH_MS);
    } finally { this.switching = false; }
  }

  /** The Restart button of the notice: use the fetched version now. The caller saves the game first. */
  async apply() {
    if (this.trial || this.switching || !this.notes.next || !await this.has(this.notes.next)) return;
    await this.tryNext();
  }

  /** The game has started. A version on try is remembered from here on; then old folders go and the site is watched. */
  async confirm() {
    if (this.confirmed || this.failed) return;
    this.confirmed = true;
    this.stuck = false;
    this.disarm();
    this.unwatch?.(); this.unwatch = null;
    const n = this.notes, web = this.phone.web;
    let served = null;
    try { served = await web.served(); } catch { /* unknown: then nothing is concluded from it, and nothing deleted */ }
    if (this.trial) {
      if (served === n.nextPath) {
        try {
          await web.remember();
          n.good = n.next; n.goodPath = n.nextPath;
        } catch { /* not remembered: the next start of the app tries it again */ }
      }
      if (n.good === n.next) {
        n.next = n.nextPath = null; n.tries = 0;
        await this.uncount();
      }
      this.trial = null;
      this.forget();
      this.keep();
    } else if (served != null) {
      // The notes follow what Capacitor really serves: the bundled copy after a folder was lost, or a fetched folder
      // whose note was.
      const name = served.split('/').pop(), folder = served.includes('/') && VERSION.test(name) ? name : null;
      if (n.good !== folder || n.goodPath !== (folder ? served : null)) {
        n.good = folder; n.goodPath = folder ? served : null;
        if (folder && n.next === folder) { n.next = n.nextPath = null; n.tries = 0; }
        this.keep();
      }
    }
    if (served != null) await this.tidy(served);
    this.watch();
  }

  /** Ask the site now and then: for a new version once the game runs, for a way out while it does not start. */
  watch() {
    if (this.watching) return;
    this.watching = true;
    this.phone.schedule(() => { if (this.confirmed) this.check(); else this.unstick(); });
  }

  /** Delete every fetched folder that is neither in use nor waiting. The folder Capacitor serves from is never deleted. */
  async tidy(served) {
    const n = this.notes, inUse = served.split('/').pop();
    try {
      for (const name of await this.phone.disk.names()) {
        if (VERSION.test(name) && name !== n.good && name !== n.next && name !== inUse) await this.phone.disk.remove(name);
      }
    } catch { /* they are looked at again on the next start */ }
  }

  /** Half a minute and the game has not started: from now on the site is asked without it. */
  async rescue() {
    if (this.confirmed || this.trial || this.failed) return;
    this.stuck = true;
    this.watch();
    await this.unstick();
  }

  /** The game does not start: a version waiting, or one the site has now, is used at once. There is no game to save. */
  async unstick() {
    if (!this.stuck || this.confirmed || this.switching) return;
    if (!this.notes.next) {
      const said = await this.check();
      if (said !== 'fetched' && said !== 'ready') return;
    }
    if (this.confirmed) return;   // it was only slow
    await this.useNext();
  }

  /** The version on try did not start: give it up and go back to the files that worked. */
  fail(reason) {
    if (!this.trial || this.confirmed || this.failed) return;
    this.failed = true;
    this.reason = reason;
    this.disarm();
    this.unwatch?.(); this.unwatch = null;
    const n = this.notes, version = this.trial, web = this.phone.web;
    this.trial = null;
    this.giveUp(version);
    this.forget();
    const bundled = () => Promise.resolve().then(() => web.serveBundled()).catch(() => {});
    if (!n.good || !n.goodPath) return bundled();
    return this.has(n.good).then(has => (has ? web.serveFolder(n.goodPath) : web.serveBundled())).catch(bundled);
  }

  /**
   * Ask the site which version it has and fetch it when it is not the one in use.
   * @returns what came of it, for the tests and for anyone looking: 'current', 'fetched', 'ready', 'unreachable',
   *   'failed', 'failed-before', 'needs-app', 'waiting' or 'skipped'
   */
  async check() {
    const now = this.phone.now();
    if (this.busy || this.switching || this.trial || this.failed || !(this.confirmed || this.stuck) || now - this.asked < GAP_MS) return 'skipped';
    if (!Number.isInteger(this.notes.build) || !this.phone.online()) return 'skipped';
    this.busy = true; this.asked = now;
    try { return await this.look(now); } catch (e) { this.problem = String(e?.message || e); return 'failed'; } finally { this.busy = false; }
  }

  async look(now) {
    const { phone, notes: n } = this, disk = phone.disk;
    const mine = readList(await phone.ownList().catch(() => null));
    if (!mine) return 'skipped';   // a set without a list cannot be compared
    const theirs = readList(await phone.siteList().catch(() => null));
    if (!theirs) return 'unreachable';
    if (this.switching) return 'skipped';   // Restart was pressed meanwhile: the folder it uses is not to be touched
    if (theirs.version === mine.version) {   // also after the site went back to this version: what was fetched is not wanted
      if (n.next) {
        const old = n.next;
        n.next = n.nextPath = null; n.tries = 0; this.ready = null;
        this.keep();
        await disk.remove(old).catch(() => {});
      }
      return 'current';
    }
    if (n.next === theirs.version && await this.has(n.next)) return this.offer(n.next, 'ready');
    if (n.bad.includes(theirs.version)) return 'failed-before';
    if (theirs.minBuild > n.build) return 'needs-app';
    if (this.gaveUp.version === theirs.version && now - this.gaveUp.at < RETRY_MS) return 'waiting';

    const name = theirs.version;
    try {
      await disk.remove(name);
      // Every folder first, one at a time: two files written at the same moment must not both be making the folder
      // they share (on the phone the second one fails with "Missing parent directory").
      await disk.make(name, [...new Set(Object.keys(theirs.files).map(path => path.split('/').slice(0, -1).join('/')))].sort());
      await pool(Object.keys(theirs.files), POOL, async path => {
        const want = theirs.files[path];
        let bytes = null;
        if (mine.files[path] === want) {   // the same file as the one in use: no need for the network
          try { bytes = await phone.fromOwn(path); } catch { bytes = null; }
          if (bytes && await phone.hash(bytes) !== want) bytes = null;
        }
        if (!bytes) {
          bytes = await phone.fromSite(path, theirs.apart.includes(path));
          if (await phone.hash(bytes) !== want) throw new Error('not the file the list names: ' + path);
        }
        await disk.write(name, path, bytes);
      });
      // The list goes in last: a folder without it is not a set of files (disk.has).
      const list = JSON.stringify({ version: theirs.version, minBuild: theirs.minBuild, files: theirs.files }) + '\n';
      await disk.write(name, 'files.json', new TextEncoder().encode(list).buffer);
      const path = await disk.pathOf(name);
      if (typeof path !== 'string' || !path) throw new Error('no folder');
      if (this.switching) throw new Error('the game is restarting');   // Restart was pressed on the version before this one
      const old = n.next;
      n.next = name; n.nextPath = path; n.tries = 0;
      if (!this.keep()) throw new Error('no room for the notes');
      if (old && old !== name) await disk.remove(old).catch(() => {});
    } catch (e) {
      this.problem = String(e?.message || e);
      if (n.next === name) { n.next = n.nextPath = null; this.keep(); }
      await disk.remove(name).catch(() => {});
      this.gaveUp = { version: name, at: now };
      return 'failed';
    }
    return this.offer(name, 'fetched');
  }

  offer(version, said) {
    if (this.ready !== version) {
      this.ready = version;
      try { this.onReady?.(version); } catch { /* the version is used at the next start anyway */ }
    }
    return said;
  }
}

/** The real phone: Capacitor's own WebView, Filesystem and App plugins, and the page's fetch and storage. */
export function makePhone(win, site) {
  const plugins = () => win.Capacitor.Plugins;
  const data = { directory: 'DATA' };   // the app's private files: files/update/<version>/
  const get = async url => {
    const res = await win.fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    return res;
  };
  const base64 = buffer => {
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return win.btoa(text);
  };
  const root = new URL('..', site).href;   // the site's own folders, one above app/
  return {
    storage: win.localStorage,
    session: win.sessionStorage,
    now: () => Date.now(),
    online: () => win.navigator?.onLine !== false,
    timer: {
      set: (fn, ms) => win.setTimeout(fn, ms),
      clear: id => win.clearTimeout(id),
      wait: ms => new Promise(done => win.setTimeout(done, ms)),
    },
    watchErrors(fn) {
      const onError = e => { if (isBreak('error', e)) fn(); }, onReject = e => { if (isBreak('unhandledrejection', e)) fn(); };
      win.addEventListener('error', onError, true);   // capture: a script that did not load says so on its own tag only
      win.addEventListener('unhandledrejection', onReject);
      return () => { win.removeEventListener('error', onError, true); win.removeEventListener('unhandledrejection', onReject); };
    },
    schedule(fn) {
      win.setTimeout(fn, FIRST_MS);
      win.setInterval(fn, EVERY_MS);
      win.document.addEventListener('visibilitychange', () => { if (!win.document.hidden) fn(); });
    },
    build: async () => Number((await plugins().App.getInfo()).build),
    ownList: async () => (await get('files.json')).json(),
    siteList: async () => (await get(site + 'files.json')).json(),
    fromOwn: async path => (await get(path)).arrayBuffer(),
    fromSite: async (path, apart) => (await get(apart ? site + path + '.txt' : root + path)).arrayBuffer(),
    hash: async buffer => Array.from(new Uint8Array(await win.crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join(''),
    disk: {
      write: (name, path, buffer) => plugins().Filesystem.writeFile({ path: `${FOLDER}/${name}/${path}`, data: base64(buffer), recursive: true, ...data }),
      make: async (name, folders) => {
        for (const folder of folders) {
          const path = `${FOLDER}/${name}${folder ? '/' + folder : ''}`;
          try { await plugins().Filesystem.mkdir({ path, recursive: true, ...data }); } catch { await plugins().Filesystem.stat({ path, ...data }); }   // "already there" is fine; anything else is not
        }
      },
      remove: async name => { try { await plugins().Filesystem.rmdir({ path: `${FOLDER}/${name}`, recursive: true, ...data }); } catch { /* was not there */ } },
      names: async () => { try { return (await plugins().Filesystem.readdir({ path: FOLDER, ...data })).files.map(f => f.name); } catch { return []; } },
      tries: async () => { try { return JSON.parse((await plugins().Filesystem.readFile({ path: `${FOLDER}/${TRIES}`, encoding: 'utf8', ...data })).data); } catch { return null; } },
      setTries: async count => {
        if (count) await plugins().Filesystem.writeFile({ path: `${FOLDER}/${TRIES}`, data: JSON.stringify(count), encoding: 'utf8', recursive: true, ...data });
        else { try { await plugins().Filesystem.deleteFile({ path: `${FOLDER}/${TRIES}`, ...data }); } catch { /* was not there */ } }
      },
      has: async name => { try { await plugins().Filesystem.stat({ path: `${FOLDER}/${name}/files.json`, ...data }); return true; } catch { return false; } },
      pathOf: async name => decodeURI((await plugins().Filesystem.getUri({ path: `${FOLDER}/${name}`, ...data })).uri).replace(/^file:\/\//, '').replace(/\/+$/, ''),
    },
    web: {
      serveFolder: path => plugins().WebView.setServerBasePath({ path }),
      serveBundled: () => plugins().WebView.setServerAssetPath({ path: 'public' }),   // Capacitor's name for the bundled copy
      remember: () => plugins().WebView.persistServerBasePath(),
      served: async () => (await plugins().WebView.getServerBasePath()).path,
    },
  };
}

function inApp(win) {
  try { return win?.Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}

/** The app's updater; null in a browser, and in an app built without an address to update from. */
export const updater = (() => {
  try { return inApp(globalThis) && APP_FILES ? new Updater(makePhone(globalThis, APP_FILES)) : null; } catch { return null; }
})();
