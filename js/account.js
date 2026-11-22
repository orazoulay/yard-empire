// Player accounts: who is signed in, and keeping their progress in step with the server.
//
// The game itself only ever reads and writes one localStorage key (account.saveKey). This module
// decides which key that is, fills it before the game starts, and uploads it while the game runs.
// Changing who is playing always ends in a page reload, so the game never swaps saves mid-run.
// On a plain file host with no server (or with no connection) the game simply plays as before.
import { saveFile } from './files.js';
import { GUEST_KEY, saveKey, logKey, pickSave, keepStore, withoutStore } from './sim/sync.js';

const ID_KEY = 'lumber-tycoon-account';        // last signed-in player, so they can start offline
const revKey = id => `lumber-tycoon-rev:u${id}`;
const FLASH_KEY = 'lumber-tycoon-flash';       // one message to show after a reload
const DEVICE_KEY = 'lumber-tycoon-device';     // this browser's own name, made once: the server lets one device at a time write a company
const elseKey = id => `lumber-tycoon-elsewhere:u${id}`;   // the server said this player's company is played on another device
const SYNC_EVERY = 20000;

const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const remove = key => { try { localStorage.removeItem(key); } catch { /* private mode */ } };
const seenRev = id => Number(read(revKey(id))) || 0;
/** This browser's name for the server: 32 hex digits, kept on the device. A browser that keeps nothing gets a new one each visit. */
function deviceName() {
  const kept = read(DEVICE_KEY);
  if (typeof kept === 'string' && /^[0-9a-f]{16,64}$/.test(kept)) return kept;
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes); else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const name = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  write(DEVICE_KEY, name);
  return name;
}

/** One API call to the Python server this page came from. Never throws: status 0 means no connection (or a timeout). */
async function serverCall(method, path, body, { timeout = 8000, keepalive = false } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch('api/' + path, {
      method, credentials: 'same-origin', cache: 'no-store', keepalive, signal: ctl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
    });
    const json = (res.headers.get('Content-Type') || '').includes('application/json');
    return { status: res.status, ok: res.ok, data: json ? await res.json().catch(() => null) : null };
  } catch {
    return { status: 0, ok: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

const problem = r => r.data?.error || (r.status === 0 ? 'No connection. Try again.' : 'Something went wrong. Try again.');

/** Tell the page how an upload went, so the status line (js/pwa.js) can say "offline" and "saved" truthfully. */
function announce(ok) {
  if (typeof dispatchEvent === 'function' && typeof CustomEvent === 'function') dispatchEvent(new CustomEvent('yard:sync', { detail: { ok } }));
}

export class Account {
  /** @param call  how to reach the backend: the Python server by default, or Supabase (js/cloud.js). Same questions, same answers. */
  constructor(call = serverCall) {
    this.call = call;
    this.user = null;         // { id, username, role } or null for a guest
    this.supported = false;   // false on a plain file host: the account buttons stay hidden
    this.online = false;
    this.rev = 0;             // the last admin change to this player's save that this device has seen
    this.open = false;        // the account sheet is showing (the game pauses)
    this.onLeave = null;      // called just before a reload: the game saves one last time and then stops saving
    this.stopped = false;
    this.busy = false;
    this.again = false;       // an upload was asked for while one was on its way
    this.flashGood = false;   // the message takeFlash() gave was good news
    this.reset = null;        // { email }: the player came by the "new password" link in an email; the form for it opens
    this.pulled = false;      // the server's save was had in this visit, and the device copy was compared with it (pull)
    this.holdStore = () => false;   // true while the game does not know the store block (js/game/store.js): an upload then carries none
    // One device at a time writes a company. Without this a game left open on one device, where nobody plays, uploaded
    // its copy every 20 seconds over what was played on another, and the newest stamp won at the next start.
    this.device = deviceName();
    this.claim = false;       // the next upload takes the company for this device: set when the server's save was had (pull), or by the player (keepHere)
    this.elsewhere = false;   // the server refused an upload: the company was opened on another device after this one. Nothing is uploaded until the player chooses.
    this.onElsewhere = null;  // called when that happens, to ask the player (js/account-ui.js)
    this.hasPassword = true;  // false for an account that only Google opens: no password to change, and none to ask for before deleting
    this.hasGoogle = false;   // Google opens this account
    this.tradingGoogle = false;
    this.deleting = false;
  }

  get saveKey() { return saveKey(this.user?.id); }
  /** True when this backend signs people in by email, so the forms have to ask for one. */
  get needsEmail() { return !!this.call.needsEmail; }
  /** Google's client ID of this game where the backend offers signing in with Google (js/cloud.js), else ''. */
  get googleId() { return this.call.google || ''; }

  /** Before the game starts: find out who is playing and put the right progress in their save slot. */
  async boot() {
    const cached = read(ID_KEY);
    const me = await this.call('GET', 'me', null, { timeout: 2500 });
    if (me.status === 0) {                          // offline: carry on as whoever played here last
      this.user = cached; this.supported = !!cached;
      if (cached) { this.rev = seenRev(cached.id); this.elsewhere = !!read(elseKey(cached.id)); }   // the word of an earlier visit stands until the server's save is had
      return this;
    }
    if (me.data?.accounts !== true) return this;    // no account server behind this page
    this.supported = true; this.online = true;
    this.user = me.data.user;
    this.reset = me.data.reset || null;
    this.hasPassword = me.data.password !== false;
    this.hasGoogle = me.data.google === true;
    if (me.data.banned) this.flash('This account is suspended.');
    else if (me.data.note) this.flash(me.data.note, me.data.noteGood === true);   // the player came back through the link in an email
    else if (cached && !this.user) this.flash('You were signed out. Sign in again to keep saving to your account.');
    if (this.user) { write(ID_KEY, this.user); await this.pull(); this.elsewhere = !!read(elseKey(this.user.id)); } else remove(ID_KEY);
    return this;
  }

  /** Compare the device copy with the server copy and keep the right one. */
  async pull() {
    const id = this.user.id;
    const localRev = seenRev(id);
    this.rev = localRev;
    const r = await this.call('GET', 'save');
    if (!r.ok || !r.data) return;                   // keep playing from the device copy (the game then knows it was not pulled)
    // a device that was told the company is played on another one takes the server's copy: it stood open, it was not played
    const pick = pickSave({ local: read(saveKey(id)), localRev, server: r.data.save, serverRev: r.data.adminRev, guest: read(GUEST_KEY), yielded: !!read(elseKey(id)) });
    // a device copy from a game that did not know the credits store takes the server's store block (js/sim/sync.js, keepStore)
    if (pick.save) write(saveKey(id), keepStore(pick.save, r.data.save)); else remove(saveKey(id));
    if (pick.from === 'guest') remove(GUEST_KEY);   // the guest game moved into this account; it is not copied to the next one
    this.rev = r.data.adminRev;
    write(revKey(id), this.rev);
    this.pulled = true;
    remove(elseKey(id));
    this.claim = true;   // this visit starts from what the server has: the company is this device's from its first upload on
  }

  /**
   * The server's copy of this player's save, asked for once more in the middle of a visit, for the game's store block
   * when the save could not be pulled as the game started (js/game/store.js). Nothing on the device changes.
   * @returns {Promise<{ save: object|null }|null>}  null when it could not be had
   */
  async serverSave() {
    if (!this.user) return null;
    const r = await this.call('GET', 'save');
    return r.ok && r.data ? { save: r.data.save ?? null } : null;
  }

  /** Once the game is running: upload progress every so often, and when the player leaves. */
  start() {
    if (!this.user) return;
    setInterval(() => this.push(), SYNC_EVERY);
    setTimeout(() => this.push(), 3000);
    addEventListener('online', () => this.push());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.push(true); });
  }

  async push(leaving = false) {
    if (!this.user || this.stopped || this.elsewhere) return;
    if (this.busy) { this.again = true; return; }
    const kept = read(this.saveKey), save = this.holdStore() ? withoutStore(kept) : kept;   // a block that is not known never replaces the server's
    if (!save) return;
    this.busy = true;
    const claim = this.claim;
    const r = await this.call('PUT', 'save', { save, adminRev: this.rev, device: this.device, ...(claim ? { claim: true } : {}) }, { keepalive: leaving });
    this.busy = false;
    this.pushed = r.ok;
    if (r.ok && claim) this.claim = false;
    this.online = r.status !== 0;
    if (this.stopped) return;
    if (r.ok || r.status === 0) announce(r.ok);
    // The connection came back while an upload was already failing: do not leave the offline save waiting for the next tick.
    const retry = this.again && r.status === 0;
    this.again = false;
    if (retry) return this.push();
    if (r.status === 409 && r.data?.elsewhere) {    // the company was opened on another device after this one: stop, and ask the player
      this.elsewhere = true;
      write(elseKey(this.user.id), true);           // a page closed without an answer loads the other device's game next time (pull)
      this.onElsewhere?.();
    } else if (r.status === 409 && r.data) {        // an admin changed this player's progress: take it over
      this.leave(() => {
        if (r.data.save) write(this.saveKey, r.data.save); else remove(this.saveKey);
        write(revKey(this.user.id), r.data.adminRev);
      });
    } else if (r.status === 401 || r.status === 403) {
      this.flash(r.data?.banned ? 'This account is suspended.' : 'You were signed out. Sign in again to keep saving to your account.');
      this.leave(() => remove(ID_KEY));
    }
  }

  /**
   * Upload the device copy now, after any upload on its way, and say whether the server took it: before a trade of
   * cash for credits, which the server pays out of the save it keeps (js/game/store.js, storeExchange).
   */
  async flush() {
    if (!this.user || this.stopped || this.elsewhere) return false;
    while (this.busy) await new Promise(done => setTimeout(done, 50));
    this.pushed = false;
    await this.push();
    return this.pushed === true && !this.stopped;
  }
  /**
   * The player's answer to "this company is played on another device": load that game here. A reload, and the page
   * that loads takes the server's copy (pull) and the company with it.
   */
  loadOther() { this.leave(); }
  /**
   * The other answer: keep this device's game. The company is taken back with this device's copy, which replaces what
   * was played on the other one. @returns whether the server took it; without a connection the next upload asks again
   */
  async keepHere() {
    if (!this.user || this.stopped) return false;
    remove(elseKey(this.user.id));
    this.elsewhere = false; this.claim = true;
    return this.flush();
  }
  /** The server changed the saved game itself and says its new revision: the device's copy already has the change, so its next upload is the right one. */
  adopt(adminRev) {
    if (!this.user || !Number.isInteger(adminRev) || adminRev < this.rev) return;
    this.rev = adminRev;
    write(revKey(this.user.id), adminRev);
  }

  // --- actions from the account sheet: each returns { ok, error? } -------------
  /** @param who  the username, or the email where the backend signs in by email */
  async signIn(who, password) { return this.enter(await this.call('POST', 'login', this.needsEmail ? { email: who, password } : { username: who, password })); }
  /** @returns { ok } or, where the email must be confirmed first, { ok: false, pending: true, email, error }: made, but not signed in yet */
  async register(username, password, email) {
    const r = await this.call('POST', 'register', { username, password, ...(this.needsEmail ? { email } : {}) });
    if (r.data?.pending) return { ok: false, pending: true, email: r.data.email || email, error: r.data.error };
    return this.enter(r);
  }

  /**
   * Sign in with a Google ID token (js/google.js). A player with an account: the page reloads, signed in. A new
   * one: { ok: false, choose: true }, and the sheet asks for a username (chooseName). Google may answer twice for
   * one choice, and a finger may tap twice: while one token is being traded another is not sent.
   */
  async google(token, nonce) {
    if (this.tradingGoogle) return { ok: false, busy: true };
    this.tradingGoogle = true;
    try {
      return this.enter(await this.call('POST', 'google', { token, nonce }));
    } finally { this.tradingGoogle = false; }
  }
  /** The username of the account Google just opened. On success the page reloads, signed in. */
  async chooseName(username) { return this.enter(await this.call('POST', 'username', { username })); }
  /** The player left the name form: nothing of that sign-in is kept. */
  forgetGoogle() { this.call('POST', 'google/cancel'); }
  /**
   * A name to put in the form: "Player_" and four digits that nobody has, or five after three tries were taken.
   * When the server cannot be asked the name is suggested anyway: the server decides when it is taken.
   */
  async suggestName(random = Math.random) {
    let name = '';
    for (let i = 0; i < 4; i++) {
      const digits = i < 3 ? 4 : 5;
      name = 'Player_' + String(Math.floor(random() * 10 ** digits)).padStart(digits, '0');
      const r = await this.call('POST', 'username/free', { name });
      if (!r.ok || r.data?.free !== false) return name;
    }
    return name;
  }

  /** Forgot password: have a code sent to this email. Only where the backend knows emails (see needsEmail). */
  async forgotPassword(email) {
    const r = await this.call('POST', 'password/forgot', { email });
    return r.ok ? { ok: true } : { ok: false, error: problem(r) };
  }
  /** Set a new password with the code from that email. On success the page reloads, signed in. */
  async resetPassword(email, code, password) { return this.enter(await this.call('POST', 'password/reset', { email, code, password })); }

  /**
   * Set a new password with the pass the link in the email brought (this.reset). On the device that asked for the
   * email the page reloads, signed in. Anywhere else: { ok, signIn: true, email }, and the player signs in by hand.
   */
  async resetByLink(password) {
    const r = await this.call('POST', 'password/link', { password });
    if (r.ok && !r.data?.user) { this.reset = null; return { ok: true, signIn: true, email: r.data?.email || '' }; }
    return this.enter(r);
  }

  /** @returns { ok } after a reload is on its way; { ok: false, choose: true } when the account has no username yet (the sheet asks for one); or { ok: false, error } */
  enter(r) {
    if (r.ok && r.data?.choose) return { ok: false, choose: true };
    if (!r.ok || !r.data?.user) return { ok: false, error: problem(r) };
    this.leave(() => write(ID_KEY, r.data.user));   // boot() loads their progress after the reload
    return { ok: true };
  }

  async signOut() {
    await this.push();                              // last upload, so nothing is left behind on this device only
    if (this.stopped) return { ok: true };
    const r = await this.call('POST', 'logout');
    if (r.status === 0) return { ok: false, error: problem(r) };
    this.leave(() => remove(ID_KEY));
    return { ok: true };
  }

  async changePassword(current, password) {
    const r = await this.call('POST', 'password', { current, password });
    return r.ok ? { ok: true } : { ok: false, error: problem(r) };
  }

  /**
   * Remove the account and everything the server keeps for it, then carry on as a guest.
   * @param proof  the password again, or for an account Google opens { google: { token, nonce } }: a Google ID token made just now
   */
  async deleteAccount(proof) {
    if (!this.user) return { ok: false, error: 'Sign in first' };
    // Google may answer twice for one choice. A second request would arrive after the account is gone, and its token
    // would then open a new, empty account for the address that was just deleted.
    if (this.deleting) return { ok: false, busy: true };
    this.deleting = true;
    const id = this.user.id;
    let r;
    try { r = await this.call('POST', 'account/delete', typeof proof === 'string' ? { password: proof } : { google: proof?.google }); } finally { this.deleting = false; }
    if (!r.ok) return { ok: false, error: problem(r) };
    this.flash('Your account was deleted.', true);   // what the player asked for: said as done, not as a problem
    // The copy on this device belonged to the account too: it goes after the game's last save, so that save cannot bring it back.
    this.leave(() => { remove(ID_KEY); remove(saveKey(id)); remove(logKey(saveKey(id))); remove(revKey(id)); remove(elseKey(id)); });
    return { ok: true };
  }

  /** Download everything the server keeps about this player as one JSON file. The data is also returned. */
  async exportData() {
    const r = await this.call('GET', 'account/export');
    if (!r.ok || !r.data?.account) return { ok: false, error: problem(r) };
    const how = await saveFile(`yard-empire-${r.data.account.username}.json`, JSON.stringify(r.data, null, 2));
    if (how === 'failed') return { ok: false, error: 'The file could not be made on this device.' };
    return { ok: true, data: r.data, how };
  }

  // --- leaderboard: null means the server could not be reached --------------------
  /**
   * The all-time list, or with 'week' the list of who gained the most company value since Monday 00:00 UTC.
   * @param board  'all' for the one list of everybody who joined (a server that has it says "board": "all" in its answer,
   *               marks the boosted companies, counts the list and gives the asking player's neighbours; a server from
   *               before it answers with the main list); 'boosted' for the companies that bought something that changes
   *               what they earn; otherwise the main list, which leaves those out
   */
  async leaderboard(period, board) {
    const query = [period === 'week' ? 'period=week' : '', board === 'boosted' || board === 'all' ? 'board=' + board : ''].filter(Boolean).join('&');
    const r = await this.call('GET', query ? 'leaderboard?' + query : 'leaderboard');
    return r.ok ? r.data : null;
  }
  async setListed(listed) { const r = await this.call('POST', 'leaderboard', { listed }); return r.ok ? r.data : null; }

  // --- helpers -----------------------------------------------------------------
  /** Reload into a different save. `change` runs after the game's last save, so it has the final word. */
  leave(change) {
    this.stopped = true;
    this.onLeave?.();
    change?.();
    location.reload();
  }

  /** @param good  good news (the email was confirmed): shown as such, not as a problem */
  flash(message, good = false) {
    try { sessionStorage.setItem(FLASH_KEY, message); if (good) sessionStorage.setItem(FLASH_KEY + '-good', '1'); else sessionStorage.removeItem(FLASH_KEY + '-good'); } catch { /* private mode */ }
  }
  takeFlash() {
    try {
      const m = sessionStorage.getItem(FLASH_KEY);
      this.flashGood = !!m && !!sessionStorage.getItem(FLASH_KEY + '-good');
      sessionStorage.removeItem(FLASH_KEY); sessionStorage.removeItem(FLASH_KEY + '-good');
      return m;
    } catch { return null; }
  }
}
