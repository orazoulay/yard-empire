// Credits on the game's side: what the server says this player has, and asking it for changes.
//
// The server decides everything (supabase/migrations/20261113000000_credits.sql). This module keeps its last answer
// in memory only: nothing about credits is written to the saved game or the device's storage, and nothing in a save
// is read as credits or ownership. So an item is owned here only once the server has said so in this visit, and a game
// started without a connection has its helpers and looks resting until the server answers.
//
// What the device does keep is a preference: which colours and which fence the player picked among the looks they own.
// A preference is applied only while the item is owned.
import { CREDITS } from './data/credits.js';

const LOOKS_KEY = 'yard-empire-looks';
const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

/**
 * @typedef {'off'|'guest'|'loading'|'offline'|'ready'} Status
 *   off: this backend has no credits (the small Python server); guest: nobody is signed in; loading: asking;
 *   offline: the server has not answered in this visit; ready: the server's answer is in hand
 */
export class Credits {
  /**
   * @param account  js/account.js: who is signed in, and `call`, the way to the backend
   * @param o  offered: credits exist on this backend (the game's Supabase project); storage: where looks are kept
   */
  constructor(account, { offered = false, storage = globalThis.localStorage, makeKey = newKey } = {}) {
    this.account = account;
    this.offered = offered;
    this.storage = storage;
    this.makeKey = makeKey;
    this.state = null;          // the server's last answer in this visit: { balance, owned, items, tasks, owner }
    this.status = offered ? (account.user ? 'loading' : 'guest') : 'off';
    this.online = true;         // the last request reached the server
    this.pending = new Map();   // item id -> the key of a purchase whose answer did not arrive: sent again unchanged
    this.listeners = [];
    this.looks = { outfit: 'classic', fence: '' };
    try { Object.assign(this.looks, pickLooks(JSON.parse(storage?.getItem(LOOKS_KEY)))); } catch { /* nothing kept */ }
  }

  onChange(fn) { this.listeners.push(fn); }
  tell() { for (const fn of this.listeners) fn(this); }

  /** Ask the server again: after signing in, after every change, and when the connection comes back. */
  async refresh() {
    if (!this.offered || !this.account.user) { this.status = this.offered ? 'guest' : 'off'; this.tell(); return; }
    if (!this.state) this.status = 'loading';
    const r = await this.account.call('GET', 'credits');
    if (r.ok && r.data && Array.isArray(r.data.owned)) { this.state = clean(r.data); this.status = 'ready'; this.online = true; }
    else if (r.status === 0) { this.online = false; if (!this.state) this.status = 'offline'; }   // what the server said earlier in this visit still stands
    else if (r.status === 404) { this.status = 'off'; this.state = null; }                        // a backend without credits
    else if (r.status === 401) { this.status = 'guest'; this.state = null; }
    else if (!this.state) this.status = 'offline';
    this.tell();
  }

  get ready() { return this.status === 'ready'; }
  get balance() { return this.ready ? this.state.balance : null; }
  get isOwner() { return this.ready && this.state.owner === true; }
  /** True only while the server has said in this visit that the player owns the item. */
  owns(id) { return this.ready && this.state.owned.includes(id); }

  /**
   * The store's list: the catalog's names with the server's prices. Before the server has answered, the catalog's
   * own (suggested) prices; once it has, only what the server offers, at its price.
   */
  items() {
    const server = this.ready ? new Map(this.state.items.map(i => [i.id, i])) : null;
    return CREDITS.items.filter(it => (server ? server.has(it.id) : it.active))
      .map(it => ({ ...it, price: server ? server.get(it.id).price : it.price, owned: this.owns(it.id), short: this.ready ? Math.max(0, (server ? server.get(it.id).price : it.price) - this.state.balance) : null }));
  }
  /** The ways to earn credits, with what the server sees of each. Only what the server verifies is listed. */
  tasks() {
    const server = this.ready ? new Map(this.state.tasks.map(t => [t.id, t])) : null;
    return CREDITS.tasks.filter(t => (server ? server.has(t.id) : t.active)).map(t => {
      const s = server?.get(t.id);
      return { ...t, credits: s ? s.credits : t.credits, have: s ? s.have : null, need: s ? s.need : t.param, claimed: !!s?.claimed, done: !!s && s.have >= s.need };
    });
  }

  /** Buy an item. The same key is sent again until an answer arrives, so a retry is never a second charge. */
  async buy(id) {
    if (!this.offered) return { ok: false, error: 'Credits are not offered here.' };
    if (!this.account.user) return { ok: false, signIn: true };
    const key = this.pending.get(id) || this.makeKey();
    this.pending.set(id, key);
    const r = await this.account.call('POST', 'credits/buy', { item: id, key });
    return this.after(r, () => this.pending.delete(id));
  }
  /** Ask for the reward of a task. The server decides whether it is done. */
  async claim(task) {
    if (!this.offered) return { ok: false, error: 'Credits are not offered here.' };
    if (!this.account.user) return { ok: false, signIn: true };
    return this.after(await this.account.call('POST', 'credits/claim', { task }));
  }
  /** The owner gives credits. Shown only to an owner; the server decides who is one. */
  async grant(username, amount, note = '') {
    if (!this.offered || !this.account.user) return { ok: false, error: 'Sign in first.' };
    return this.after(await this.account.call('POST', 'credits/grant', { username, amount, note, key: this.makeKey() }));
  }
  /** After a change: the server's answer, then its whole state again. No connection: nothing is assumed. */
  async after(r, settled = () => {}) {
    if (r.status === 0) { this.online = false; this.tell(); return { ok: false, offline: true, error: 'No connection. Try again.' }; }
    settled();
    await this.refresh();
    return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.data?.error || 'Something went wrong. Try again.', code: r.data?.code };
  }

  /** Pick a look among the owned ones: kept on this device, applied only while the item is owned. */
  setLook(kind, choice) {
    if (!(kind in this.looks)) return;
    this.looks[kind] = choice;
    try { this.storage?.setItem(LOOKS_KEY, JSON.stringify(this.looks)); } catch { /* private mode */ }
    this.tell();
  }
  /** The look in force: the pick when the item is owned, the game's own otherwise ('' for the fence: each yard keeps its own). */
  look(kind) {
    const item = CREDITS.items.find(i => i.does === kind), pick = this.looks[kind];
    if (!item || !this.owns(item.id) || !item.choices?.some(c => c.id === pick)) return kind === 'outfit' ? item?.choices?.[0] || null : '';
    return kind === 'outfit' ? item.choices.find(c => c.id === pick) : pick;
  }
}

/** Only the two preferences, as text; anything else the device holds under that key is dropped. */
function pickLooks(raw) {
  const out = {};
  if (raw && typeof raw === 'object') for (const k of ['outfit', 'fence']) if (typeof raw[k] === 'string' && raw[k].length <= 30) out[k] = raw[k];
  return out;
}
/** The server's answer, in the shapes the store reads. Anything else in it is dropped. */
function clean(d) {
  const int = v => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    balance: int(d.balance),
    owned: d.owned.filter(id => typeof id === 'string'),
    items: (Array.isArray(d.items) ? d.items : []).filter(i => typeof i?.id === 'string').map(i => ({ id: i.id, kind: String(i.kind || ''), price: int(i.price) })),
    tasks: (Array.isArray(d.tasks) ? d.tasks : []).filter(t => typeof t?.id === 'string').map(t => ({ id: t.id, credits: int(t.credits), have: int(t.have), need: Math.max(1, int(t.need)), claimed: t.claimed === true })),
    owner: d.owner === true,
  };
}
