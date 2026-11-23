// A game played without an account, kept on the server (supabase/migrations/20261123120000_guests.sql) under a key that
// only this device holds. The device keeps a copy too, in the save slot the game has always used, so that a guest plays
// on with no connection. js/account.js decides when: this file only knows how.
import { GUEST_KEY, pickSave } from './sim/sync.js';

export const GUEST_ID_KEY = 'lumber-tycoon-guest';         // the key: 64 hex digits, made when the first save is about to be sent
const GONE_KEY = 'lumber-tycoon-guest-gone';               // keys whose games are to be deleted at the next connection
const TOLD_KEY = 'lumber-tycoon-guest-told';               // the player was told that the game is kept on the server

const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const remove = key => { try { localStorage.removeItem(key); } catch { /* private mode */ } };
const good = key => typeof key === 'string' && /^[0-9a-f]{64}$/.test(key);

function makeKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);   // a key that could be guessed would open the game: with no real randomness there is no key
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** The game was played: something was bought in it, or a company was sold. A visitor who only looks leaves nothing on the server, and a blank game is no game. */
export const played = save => !!save && typeof save === 'object'
  && (Object.keys(save.unlocked || {}).length > 0 || Number(save.company?.legacy?.sales) > 0 || Number(save.company?.legacy?.stars) > 0);

export class GuestGame {
  /** @param call  how to reach the backend, as Account has it */
  constructor(call) {
    this.call = call;
    this.off = true;          // until the account client says that this backend may keep guests (Account.boot)
    this.unsure = false;      // the server keeps a game under this device's key and has not said which: nothing is uploaded over it
    this.lost = false;        // the device had no game of its own as it started: whatever the server has is this guest's game
    this.kept = false;        // the server has this device's game, as far as the last answer says
    this.busy = false;
    this.onKept = null;       // called once, when the server has taken this device's game for the first time
    this.onFound = null;      // called with the server's save, when it is the game of a device that lost its own (Account reloads into it)
  }
  get key() { const k = read(GUEST_ID_KEY); return good(k) ? k : null; }
  /** The key leads nowhere any more: its game moved into an account. */
  forget() { remove(GUEST_ID_KEY); }

  /** One request. A backend that keeps no guests answers 404: nothing more is asked of it in this visit. */
  async ask(what, body, opts) {
    const r = await this.call('POST', 'guest/' + what, body, opts);
    if (r.status === 404) this.off = true;
    return r;
  }

  /** This visit may ask the backend about guests, when it is one that keeps them (js/cloud.js says so; the Python server does not). */
  on() { this.off = !this.call.guests; }
  /** A start with no connection: what the server has is asked before the first upload. */
  offline() {
    this.on();
    this.unsure = !this.off && !!this.key;
    this.lost = !played(read(GUEST_KEY));
  }
  /** Before the game starts, for a guest: what is to be deleted goes, and the copy played last is put in the save slot. */
  async boot() {
    this.offline();
    await this.clear();
    if (!this.unsure || this.off) return;
    const local = read(GUEST_KEY), server = await this.find(2500);
    if (server === undefined) return;            // keep playing from the device's copy; asked again before the first upload
    const pick = pickSave({ local: played(local) ? local : null, server });
    if (pick.from === 'server' && pick.save) write(GUEST_KEY, pick.save);
  }
  /** The server's copy of this guest's game: the save, null when it has none, or undefined when there was no answer. */
  async find(timeout) {
    const r = await this.ask('load', { key: this.key }, timeout ? { timeout } : {});
    if (!r.ok || !r.data) return undefined;
    this.unsure = false;
    this.kept = !!r.data.save;
    return r.data.save ?? null;
  }

  /** Delete the games this device has given up. A key whose delete does not land is kept for the next time. */
  async clear() {
    const listed = () => { const gone = read(GONE_KEY); return Array.isArray(gone) ? gone.filter(good) : []; };
    for (const key of listed()) {
      if (this.off) return;
      const r = await this.ask('delete', { key }, { timeout: 2500 });
      if (!r.ok) continue;
      const left = listed().filter(k => k !== key);   // read again: a reset in the meantime may have added one
      if (left.length) write(GONE_KEY, left); else remove(GONE_KEY);
    }
  }

  /** Upload the device's copy. */
  async push(leaving = false) {
    if (this.off || this.busy) return;
    if (this.unsure && this.key) {
      this.busy = true;
      const server = await this.find();
      this.busy = false;
      if (server === undefined) return;
      if (this.lost && server) { this.onFound?.(server); return; }
    }
    const save = read(GUEST_KEY);
    if (!played(save)) return;
    let key = this.key;
    if (!key) {
      try { key = makeKey(); } catch { this.off = true; return; }
      write(GUEST_ID_KEY, key);
      if (this.key !== key) { this.off = true; return; }   // a browser that keeps nothing would make a guest for every upload
    }
    this.busy = true;
    const r = await this.ask('save', { key, save }, { keepalive: leaving });
    this.busy = false;
    if (!r.ok) this.kept = false; else if (r.data?.ok) this.kept = true;   // "later" changes nothing: what is there stays there
    if (this.kept && !read(TOLD_KEY)) { write(TOLD_KEY, true); this.onKept?.(); }
  }

  /** "Reset progress", or a game that went another way: the one on the server goes as well, now or at the next connection. */
  reset() {
    const key = this.key;
    this.forget();
    this.unsure = false;
    if (!key) return;
    const gone = read(GONE_KEY);
    write(GONE_KEY, [...(Array.isArray(gone) ? gone : []), key]);
  }

  /**
   * The player is signed in and this device holds a guest's game: ask the server to move it into the account. Nothing on
   * the device changes here (js/account.js). @returns what the server said:
   *   'moved' with the account's `save` now; 'moved_before': it was, and the answer was lost; 'has_save': the account has a
   *   game of its own; 'refused': it will not; 'later': out of reach, to be asked again
   */
  async move(save) {
    const key = this.key;
    if (!key || !save) return { what: 'refused' };
    const r = await this.ask('move', { key, save });
    if (r.ok && r.data?.moved) return { what: 'moved', save: r.data.save };
    if (r.ok && (r.data?.why === 'moved_before' || r.data?.why === 'has_save')) return { what: r.data.why };
    if (r.status === 0 || r.status >= 500 || [401, 403, 429].includes(r.status) || (r.ok && r.data?.later)) return { what: 'later' };
    return { what: 'refused' };
  }
}
