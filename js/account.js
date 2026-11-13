// Player accounts: who is signed in, and keeping their progress in step with the server.
//
// The game itself only ever reads and writes one localStorage key (account.saveKey). This module
// decides which key that is, fills it before the game starts, and uploads it while the game runs.
// Changing who is playing always ends in a page reload, so the game never swaps saves mid-run.
// On a plain file host with no server (or with no connection) the game simply plays as before.
import { saveFile } from './files.js';
import { GUEST_KEY, saveKey, pickSave } from './sim/sync.js';

const ID_KEY = 'lumber-tycoon-account';        // last signed-in player, so they can start offline
const revKey = id => `lumber-tycoon-rev:u${id}`;
const FLASH_KEY = 'lumber-tycoon-flash';       // one message to show after a reload
const SYNC_EVERY = 20000;

const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const remove = key => { try { localStorage.removeItem(key); } catch { /* private mode */ } };
const seenRev = id => Number(read(revKey(id))) || 0;

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
  }

  get saveKey() { return saveKey(this.user?.id); }
  /** True when this backend signs people in by email, so the forms have to ask for one. */
  get needsEmail() { return !!this.call.needsEmail; }

  /** Before the game starts: find out who is playing and put the right progress in their save slot. */
  async boot() {
    const cached = read(ID_KEY);
    const me = await this.call('GET', 'me', null, { timeout: 2500 });
    if (me.status === 0) {                          // offline: carry on as whoever played here last
      this.user = cached; this.supported = !!cached;
      if (cached) this.rev = seenRev(cached.id);
      return this;
    }
    if (me.data?.accounts !== true) return this;    // no account server behind this page
    this.supported = true; this.online = true;
    this.user = me.data.user;
    this.reset = me.data.reset || null;
    if (me.data.banned) this.flash('This account is suspended.');
    else if (me.data.note) this.flash(me.data.note, me.data.noteGood === true);   // the player came back through the link in an email
    else if (cached && !this.user) this.flash('You were signed out. Sign in again to keep saving to your account.');
    if (this.user) { write(ID_KEY, this.user); await this.pull(); } else remove(ID_KEY);
    return this;
  }

  /** Compare the device copy with the server copy and keep the right one. */
  async pull() {
    const id = this.user.id;
    const localRev = seenRev(id);
    this.rev = localRev;
    const r = await this.call('GET', 'save');
    if (!r.ok || !r.data) return;                   // keep playing from the device copy
    const pick = pickSave({ local: read(saveKey(id)), localRev, server: r.data.save, serverRev: r.data.adminRev, guest: read(GUEST_KEY) });
    if (pick.save) write(saveKey(id), pick.save); else remove(saveKey(id));
    if (pick.from === 'guest') remove(GUEST_KEY);   // the guest game moved into this account; it is not copied to the next one
    this.rev = r.data.adminRev;
    write(revKey(id), this.rev);
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
    if (!this.user || this.stopped) return;
    if (this.busy) { this.again = true; return; }
    const save = read(this.saveKey);
    if (!save) return;
    this.busy = true;
    const r = await this.call('PUT', 'save', { save, adminRev: this.rev }, { keepalive: leaving });
    this.busy = false;
    this.online = r.status !== 0;
    if (this.stopped) return;
    if (r.ok || r.status === 0) announce(r.ok);
    // The connection came back while an upload was already failing: do not leave the offline save waiting for the next tick.
    const retry = this.again && r.status === 0;
    this.again = false;
    if (retry) return this.push();
    if (r.status === 409 && r.data) {               // an admin changed this player's progress: take it over
      this.leave(() => {
        if (r.data.save) write(this.saveKey, r.data.save); else remove(this.saveKey);
        write(revKey(this.user.id), r.data.adminRev);
      });
    } else if (r.status === 401 || r.status === 403) {
      this.flash(r.data?.banned ? 'This account is suspended.' : 'You were signed out. Sign in again to keep saving to your account.');
      this.leave(() => remove(ID_KEY));
    }
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

  enter(r) {
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

  /** Remove the account and everything the server keeps for it, then carry on as a guest. Needs the password again. */
  async deleteAccount(password) {
    if (!this.user) return { ok: false, error: 'Sign in first' };
    const id = this.user.id;
    const r = await this.call('POST', 'account/delete', { password });
    if (!r.ok) return { ok: false, error: problem(r) };
    this.flash('Your account was deleted.', true);   // what the player asked for: said as done, not as a problem
    // The copy on this device belonged to the account too: it goes after the game's last save, so that save cannot bring it back.
    this.leave(() => { remove(ID_KEY); remove(saveKey(id)); remove(revKey(id)); });
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
  /** The all-time list, or with 'week' the list of who gained the most company value since Monday 00:00 UTC. */
  async leaderboard(period) { const r = await this.call('GET', period === 'week' ? 'leaderboard?period=week' : 'leaderboard'); return r.ok ? r.data : null; }
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
