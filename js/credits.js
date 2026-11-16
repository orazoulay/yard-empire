// @ts-check
// Credits on the game's side: what the server says this player has, and asking it for changes.
//
// The server decides everything (supabase/migrations/20261113000000_credits.sql). This module keeps its last answer
// in memory only: nothing about credits is written to the saved game or the device's storage, and nothing in a save
// is read as credits or ownership. So an item is owned here only once the server has said so in this visit, and a game
// started without a connection has its helpers and looks resting until the server answers.
//
// What the device does keep is a preference: which choice the player picked of each look they own (the colours, the
// fence, and every look of the store's fifth part: the hat, the sky, the tune and so on). A preference is applied only
// while the item is owned, and it is this device's: another device shows a look's first choice until one is picked there.
import { CREDITS } from './data/credits.js';

const LOOKS_KEY = 'yard-empire-looks';
/** What a pick is kept under: what the item does, and for a second set of choices of the same item (the emblem's colour) the set's name after a colon. */
const pickKey = (kind, set = '') => (set ? `${kind}:${set}` : kind);
/** Every pick the device may keep: one for each set of choices a catalog sells. */
const picksOf = catalog => new Set(catalog.items.flatMap(i => (i.choices || []).map(ch => pickKey(i.does, ch.set))));
const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);
/** A clock this device's date cannot move: milliseconds since the page began (performance.now()), or NaN where there is none. */
const steadyNow = () => (typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : NaN);
// How far the device's date may run apart from the steady clock since the server's last answer before it counts as
// moved: about a minute, and a thousandth of the time passed (a date set over the network drifts a little, and is put right).
const MOVED_MS = 60000;
const WAKE_MS = 5 * 60000;     // a tab shown again this long after the last answer asks the server again (not on every flick)
const REASK_MS = 30000;        // the server is asked again by the clock or a wake no more often than this

/**
 * @typedef {'off'|'guest'|'loading'|'offline'|'ready'} Status
 *   off: this backend has no credits (the small Python server); guest: nobody is signed in; loading: asking;
 *   offline: the server has not answered in this visit; ready: the server's answer is in hand
 */
export class Credits {
  /**
   * @param account  js/account.js: who is signed in, and `call`, the way to the backend
   * @param o  offered: credits exist on this backend (the game's Supabase project); storage: where looks are kept;
   *           catalog: what credits buy (the game's own, js/data/credits.js; a test gives one of its own)
   */
  constructor(account, { offered = false, storage = globalThis.localStorage, makeKey = newKey, wall = () => Date.now(), steady = steadyNow, catalog = CREDITS } = {}) {
    this.account = account;
    this.catalog = catalog;
    this.picks = picksOf(catalog);   // the picks this device may keep
    this.offered = offered;
    this.storage = storage;
    this.makeKey = makeKey;
    this.wall = wall;           // this device's date, in milliseconds (Date.now)
    this.steady = steady;       // a clock the device's date cannot move (performance.now): it says when the date was moved
    this.anchor = null;         // at the server's last answer that said its time: { server, wall, steady }, the three clocks then
    this.moved = false;         // the device's date moved against the steady clock since that answer: the clock is not sure until the next one
    this.reasked = null;        // when the server was last asked again because of the clock or a wake: { wall, steady }
    this.state = null;          // the server's last answer in this visit: { balance, owned, items, tasks, owner, receipts, counts, boosted, gift, engine, deal, grace, passes, now }
    this.skew = 0;              // the server's clock less this device's, in milliseconds, as of its last answer that said its time (0 until one did)
    this.answered = false;      // the store has answered in this visit: a 404 after that is an answer lost, not a backend without credits
    this.onSale = null;         // for a visitor: what the server's catalog sells, id -> price, once it could be asked
    this.giftKey = null;        // the key of a gift request whose answer did not arrive: sent again unchanged
    this.tradeKey = null;       // the key of a trade of cash whose answer did not arrive: sent again unchanged
    this.status = offered ? (account.user ? 'loading' : 'guest') : 'off';
    this.online = true;         // the last request reached the server
    this.pending = new Map();   // item id -> the key of a purchase whose answer did not arrive: sent again unchanged
    this.listeners = [];
    this.asked = 0;             // requests of refresh() sent in this visit: only the newest one's answer is kept
    this.looks = { outfit: 'classic', fence: '' };
    try { Object.assign(this.looks, pickLooks(JSON.parse(storage?.getItem(LOOKS_KEY)), this.picks)); } catch { /* nothing kept */ }
  }

  onChange(fn) { this.listeners.push(fn); }
  tell() { for (const fn of this.listeners) fn(this); }

  /** Ask the server again: after signing in, after every change, and when the connection comes back. */
  async refresh() {
    if (!this.offered) { this.status = 'off'; this.tell(); return; }
    // Two answers can arrive out of order (the store's own refresh on opening, landing after a purchase's): an answer
    // to a request that a newer one has overtaken is dropped, so a purchase just made is never shown as not owned.
    const call = ++this.asked;
    if (!this.account.user) {   // a visitor: no balance and nothing owned, but the store shows what the server sells
      this.status = 'guest';
      const o = await this.account.call('GET', 'credits/offered');
      if (call !== this.asked) return;
      if (o.ok && Array.isArray(o.data?.items)) this.onSale = new Map(o.data.items.filter(i => typeof i?.id === 'string').map(i => [i.id, Number.isInteger(i.price) && i.price > 0 ? i.price : 0]));
      this.tell();
      return;
    }
    if (!this.state) this.status = 'loading';
    const r = await this.account.call('GET', 'credits');
    if (call !== this.asked) return;
    if (r.ok && r.data && Array.isArray(r.data.owned)) {
      this.state = clean(r.data); this.skew = this.state.now ? this.state.now - this.wall() : 0; this.status = 'ready'; this.online = true; this.answered = true;
      this.anchor = this.state.now ? { server: this.state.now, wall: this.wall(), steady: this.steady() } : null;
      this.moved = false;
    }
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
  /** The purchases the game still has to apply (js/sim/store.js): [{ id, item, at }], oldest first. Empty until the server answers. */
  get receipts() { return this.ready ? this.state.receipts : []; }
  /** The levels of the items that have levels: { itemId: n }. */
  get counts() { return this.ready ? this.state.counts : {}; }
  /** The level owned of an item: 0 when it is not owned, 1 for an item without levels, else the server's count. */
  level(id) { return this.owns(id) ? Math.max(1, this.counts[id] || 1) : 0; }
  /** The account bought something that changes what a business earns: it is on the boosted ranking. */
  get boosted() { return this.ready && this.state.boosted; }
  /** The daily gift, { ready, credits }, or null where there is none to speak of (no answer yet, or a server without it). */
  get daily() { return this.ready ? this.state.gift : null; }
  /** The server runs the store's engine (receipts, limits, two rankings): false for a server from before it. */
  get engine() { return this.ready && this.state.engine; }
  /**
   * The day's deal, { item, price, was, until }: one item at half price until the server's day ends. null where there
   * is none, or no answer, and once the server's clock (now()) is past its end, whatever the network does: an open page
   * never goes on showing a price that is no longer charged.
   */
  get deal() { return this.ready && this.state.deal && this.now() < this.state.deal.until ? this.state.deal : null; }
  /** Yesterday's deal in the first ten minutes of the server's day, still charged at half until `until`: { item, price, was, until }, or null. */
  get grace() { return this.ready && this.state.grace && this.now() < this.state.grace.until ? this.state.grace : null; }
  /** When the soonest of the server's half prices ends (ms), so that a page open over it is drawn again then; null when there is none. */
  get dealEnds() {
    const ends = this.ready ? [this.state.deal, this.state.grace].filter(Boolean).map(d => d.until) : [];
    return ends.length ? Math.min(...ends) : null;
  }
  /** A pass the player bought, { until, months? }: until when it is (or was) owned, and for a pass that ends with the month, the months it was bought in. null: never bought, or no answer. */
  pass(id) { return (this.ready && this.state.passes[id]) || null; }
  /**
   * Was the pass `id` held for the month 'YYYY-MM' (the server's calendar)? true or false while the server's answer
   * is in hand. null whenever someone is signed in where credits are offered and it is not: on its way, no
   * connection, or dropped in the middle of a visit (a 401: the session ran out; a 404 after an answer). Then nobody
   * can tell, and what waits for this word goes on waiting: a reward that was paid for is never taken for "not held".
   * 'forgotten' for a month that began before what the server remembers (its answer says from when: `since`): a
   * purchase in it may be gone from the server's memory, so nobody can tell any more, and never will. Not "not held".
   * A visitor holds nothing, and nobody does on a backend without credits (a 404 from the first request).
   */
  heldMonth(id, month) {
    if (this.ready) {
      const p = this.state.passes[id];
      if (p?.months?.includes(month)) return true;
      return p?.since > Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1) ? 'forgotten' : false;
    }
    if (!this.offered || !this.account.user) return false;
    return this.status === 'off' && !this.answered ? false : null;
  }
  /**
   * The time by the server's clock, in milliseconds, once it has said it in this visit; this device's clock until
   * then. An answer that is dropped later in the visit does not take the server's time with it. It counts on from the
   * server's time by this device's date; once that date has been moved (clockMoved), never earlier than the steady
   * clock counts: a date set back does not take the time back. A date moved forward is followed (a computer that slept
   * moves it so too), and the clock is not sure until the server answers again.
   */
  now() {
    const wall = this.wall() + this.skew, a = this.anchor;
    if (!a || !this.clockMoved()) return wall;
    return Math.max(wall, a.server + (this.steady() - a.steady));
  }
  /** True when now() is the server's time: it has answered in this visit, said what time it is, and the device's date has not moved since. */
  get clockSure() { return this.ready && this.state.now > 0 && !this.clockMoved(); }
  /**
   * Has the device's date moved against the steady clock since the server's last answer, by more than about a minute?
   * Once it has, it stays so until the next answer, and the server is asked again at once (when it can be reached, the
   * clock is sure again within a moment). A player who never touches their date meets this only when the computer
   * slept with the game open: then the date runs on and the steady clock did not.
   */
  clockMoved() {
    const a = this.anchor;
    if (this.moved || !a || !Number.isFinite(a.steady)) return this.moved;
    const passed = this.steady() - a.steady, drift = this.wall() - a.wall - passed;
    if (!(Math.abs(drift) <= MOVED_MS + Math.abs(passed) / 1000)) { this.moved = true; this.reask(); }
    return this.moved;
  }
  /** The tab is shown again: five minutes or more after the server's last answer (or with none yet), it is asked again. */
  wake() {
    if (!this.offered || !this.account.user) return;
    const a = this.anchor, passed = a ? Math.max(this.wall() - a.wall, this.steady() - a.steady || 0) : Infinity;
    if (passed >= WAKE_MS || this.clockMoved()) this.reask();
  }
  /**
   * Ask the server again for the clock's sake, no more often than every half minute: by the steady clock, or by the
   * device's date when that has moved on (a computer that slept moved its date and hardly its steady clock).
   */
  reask() {
    const at = { wall: this.wall(), steady: this.steady() }, was = this.reasked;
    if (!this.offered || !this.account.user) return;
    const gone = was ? Math.max(Math.abs(at.wall - was.wall), Number.isFinite(at.steady - was.steady) ? at.steady - was.steady : 0) : Infinity;
    if (gone < REASK_MS) return;
    this.reasked = at;
    this.refresh();
  }

  /**
   * The store's list: the catalog's names with the server's prices. Before the server has answered, the catalog's
   * own (suggested) prices; once it has, only what the server offers, at its price. An item that is not on sale keeps
   * its row, marked `sale: false` (no price to pay), while the player owns it (the server says so: a Monthly card that
   * runs, a Season pass, a helper) or the game says something of it waits (`keep`: ids, from the saved game: a ticket
   * that waits for its event, a purchase of the piggy bank that waits for it to fill, a month's rewards owed): what
   * was bought before is used on its row, also once the owner has taken the item off sale.
   * @param keep  ids of the catalog whose rows stay whether or not they are on sale
   */
  items(keep = []) {
    const server = this.ready ? new Map(this.state.items.map(i => [i.id, i])) : null, sale = server ? null : this.onSale, kept = new Set(keep);
    const onSale = it => (server ? server.has(it.id) : sale ? sale.has(it.id) : !!it.active);
    return this.catalog.items.filter(it => onSale(it) || this.owns(it.id) || kept.has(it.id)).map(it => {
      const s = server?.get(it.id), listed = onSale(it), half = s ? [this.state.deal, this.state.grace].find(d => d && d.item === it.id && d.was > s.price) : null;
      // a half price whose time is over (the server's clock says so) is not shown, also before the next answer: the item's usual price is
      const over = !!half && this.now() >= half.until, price = s ? (over ? half.was : s.price) : sale?.get(it.id) || it.price;
      // how it is sold is the server's word once it has answered: a repeat item is never "owned", it is bought again.
      // An item with levels (max_count) is bought level by level and owned from the first; `owned` says there is nothing more of it to buy.
      const mode = s ? s.mode : it.mode || 'once', levels = it.max_count > 1 ? it.max_count : 0, repeat = mode === 'repeat' && !levels;
      const level = levels ? Math.min(levels, this.level(it.id)) : 0;
      // `was`: the item is the day's deal (or yesterday's, in its ten minutes: `grace`), and this is what it costs on other days. `until`: a pass, and until when it is (or was) owned.
      return { ...it, price, mode, repeat, levels, level, earning: s ? s.earning : it.earning === true, left: s ? s.left : null, sale: listed,
        owned: levels ? level >= levels : !repeat && this.owns(it.id), short: this.ready && listed ? Math.max(0, price - this.state.balance) : null,
        was: half && !over ? half.was : null, grace: !!half && !over && half === this.state.grace, until: this.pass(it.id)?.until ?? null };
    });
  }
  /** The ways to earn credits, with what the server sees of each. Only what the server verifies is listed. */
  tasks() {
    const server = this.ready ? new Map(this.state.tasks.map(t => [t.id, t])) : null;
    return this.catalog.tasks.filter(t => t.rule !== 'daily' && (server ? server.has(t.id) : t.active)).map(t => {   // the daily gift has a row of its own
      const s = server?.get(t.id);
      return { ...t, credits: s ? s.credits : t.credits, have: s ? s.have : null, need: s ? s.need : t.param, claimed: !!s?.claimed, done: !!s && s.have >= s.need };
    });
  }

  /**
   * Buy an item. The same key is sent again until an answer arrives, so a retry is never a second charge.
   * @param price  the price the player was shown and confirmed: the server charges no more than that, and when the
   *   item costs more now it charges nothing and answers code 'price' with the price now
   */
  async buy(id, price) {
    if (!this.offered) return { ok: false, error: 'Credits are not offered here.' };
    if (!this.account.user) return { ok: false, signIn: true };
    const key = this.pending.get(id) || this.makeKey();
    this.pending.set(id, key);
    const r = await this.account.call('POST', 'credits/buy', { item: id, key, ...(Number.isInteger(price) ? { price } : {}) });
    return this.after(r, () => this.pending.delete(id));
  }
  /** Ask for the reward of a task. The server decides whether it is done. */
  async claim(task) {
    if (!this.offered) return { ok: false, error: 'Credits are not offered here.' };
    if (!this.account.user) return { ok: false, signIn: true };
    return this.after(await this.account.call('POST', 'credits/claim', { task }));
  }
  /** Collect the daily gift. The same key is sent again until an answer arrives; the server decides whether today's is still there. */
  async gift() {
    if (!this.offered) return { ok: false, error: 'Credits are not offered here.' };
    if (!this.account.user) return { ok: false, signIn: true };
    if (!this.daily) return { ok: false, error: 'There is no gift to collect.' };
    const key = this.giftKey || (this.giftKey = this.makeKey());
    return this.after(await this.account.call('POST', 'credits/gift', { key }), () => { this.giftKey = null; });
  }
  /**
   * The next trade of cash for credits, { credits, price, today }: what it pays, the cash it costs, and how many were
   * made today (UTC). null where there is none to speak of: no answer yet, or a server from before the trade.
   */
  get trade() { return this.ready ? this.state.exchange : null; }
  /**
   * Trade cash for credits. The server takes the price out of the save it keeps (supabase/migrations/20261119000000_exchange.sql),
   * so the game uploads its save first and takes the same price out of the save in play after (js/game/store.js, storeExchange).
   * The same key is sent again until an answer arrives, so a retry is never a second trade.
   * @param price  the cash the page showed: when the day's price is another, nothing happens and the answer says the price now
   * @returns { ok, credits, price, next, balance, cash, adminRev, again? } or { ok: false, error, code?, price? }
   */
  async exchange(price) {
    if (!this.offered) return { ok: false, error: 'Credits are not offered here.' };
    if (!this.account.user) return { ok: false, signIn: true };
    const key = this.tradeKey || (this.tradeKey = this.makeKey());
    return this.after(await this.account.call('POST', 'credits/exchange', { key, price }), () => { this.tradeKey = null; });
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
    return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.data?.error || 'Something went wrong. Try again.', code: r.data?.code, ...(Number.isInteger(r.data?.price) ? { price: r.data.price } : {}) };
  }

  /**
   * Pick a look among the owned ones: kept on this device, applied only while the item is owned.
   * @param choice  a choice's id; 'none' for the game's own look ('' for the fence, as before)
   * @param set     a second set of choices of the same item: 'colour' for the emblem's
   */
  setLook(kind, choice, set = '') {
    const key = pickKey(kind, set);
    if (!this.picks.has(key) || typeof choice !== 'string' || choice.length > 30) return;
    this.looks[key] = choice;
    try { this.storage?.setItem(LOOKS_KEY, JSON.stringify(this.looks)); } catch { /* private mode */ }
    this.tell();
  }
  /** The look in force: the pick when the item is owned, the game's own otherwise ('' for the fence: each yard keeps its own). */
  look(kind) {
    const item = this.catalog.items.find(i => i.does === kind), pick = this.looks[kind];
    if (!item || !this.owns(item.id) || !item.choices?.some(c => c.id === pick)) return kind === 'outfit' ? item?.choices?.[0] || null : '';
    return kind === 'outfit' ? item.choices.find(c => c.id === pick) : pick;
  }
  /**
   * The choice in force of a look of the store's fifth part (what the item does; `set` for its second set of choices):
   * the choice's row of the catalog, or null for the game's own look. Not owned, or no answer of the server in this
   * visit: null. Owned and never picked on this device: the first choice, so that what was bought is seen at once, on
   * every device. 'none' is a pick like any other: the game's own look, though the item is owned.
   */
  chosen(kind, set = '') {
    const item = this.catalog.items.find(i => i.does === kind);
    if (!item || !this.owns(item.id)) return null;
    const list = (item.choices || []).filter(c => (c.set || '') === set), pick = this.looks[pickKey(kind, set)];
    return pick === 'none' ? null : list.find(c => c.id === pick) || list[0] || null;
  }
  /** What the chooser marks as picked, for an item as items() lists it: a choice's id, or 'none'. The same rule as chosen(), whether or not the item is owned. */
  picked(item, set = '') {
    const list = (item.choices || []).filter(c => (c.set || '') === set), pick = this.looks[pickKey(item.does, set)];
    return pick === 'none' ? 'none' : (list.find(c => c.id === pick) || list[0])?.id || 'none';
  }
}

/** Only the picks of the looks the catalog sells, as text; anything else the device holds under that key is dropped. */
function pickLooks(raw, picks) {
  const out = {};
  if (raw && typeof raw === 'object') for (const k of picks) if (typeof raw[k] === 'string' && raw[k].length <= 30) out[k] = raw[k];
  return out;
}
/** The server's answer, in the shapes the store reads. Anything else in it is dropped. */
function clean(d) {
  const int = v => (Number.isInteger(v) && v >= 0 ? v : 0);
  const half = h => (h && typeof h === 'object' && typeof h.item === 'string' && int(h.price) > 0 ? { item: h.item, price: int(h.price), was: int(h.was), until: int(h.until) } : null);
  return {
    balance: int(d.balance),
    owned: d.owned.filter(id => typeof id === 'string'),
    items: (Array.isArray(d.items) ? d.items : []).filter(i => typeof i?.id === 'string').map(i => ({ id: i.id, kind: String(i.kind || ''), price: int(i.price),
      mode: ['once', 'repeat', 'pass'].includes(i.mode) ? i.mode : 'once', earning: i.earning === true, left: Number.isInteger(i.left_today) && i.left_today >= 0 ? i.left_today : null })),
    tasks: (Array.isArray(d.tasks) ? d.tasks : []).filter(t => typeof t?.id === 'string').map(t => ({ id: t.id, credits: int(t.credits), have: int(t.have), need: Math.max(1, int(t.need)), claimed: t.claimed === true })),
    owner: d.owner === true,
    // the store's engine (supabase/migrations/20261115000000_store.sql); a server from before it sends none of these
    receipts: (Array.isArray(d.receipts) ? d.receipts : []).filter(r => typeof r?.id === 'string' && typeof r?.item === 'string').map(r => ({ id: r.id, item: r.item, at: int(r.at) })),
    counts: Object.fromEntries(Object.entries(d.counts && typeof d.counts === 'object' && !Array.isArray(d.counts) ? d.counts : {}).filter(([, n]) => Number.isInteger(n) && n > 0)),
    boosted: d.boosted === true,
    gift: d.gift && typeof d.gift === 'object' && int(d.gift.credits) > 0 ? { ready: d.gift.ready === true, credits: int(d.gift.credits) } : null,
    engine: Array.isArray(d.receipts),
    // the store's offers (supabase/migrations/20261116000000_offers.sql); a server from before them sends none of these
    deal: half(d.deal),
    grace: half(d.grace),
    passes: Object.fromEntries(Object.entries(d.passes && typeof d.passes === 'object' && !Array.isArray(d.passes) ? d.passes : {}).filter(([, p]) => p && typeof p === 'object' && int(p.until) > 0)
      .map(([id, p]) => [id, { until: int(p.until), ...(Array.isArray(p.months) ? { months: p.months.filter(m => typeof m === 'string' && /^[0-9]{4}-[0-9]{2}$/.test(m)) } : {}), ...(int(p.since) > 0 ? { since: int(p.since) } : {}) }])),
    now: int(d.now),
    // the trade of cash for credits (supabase/migrations/20261119000000_exchange.sql); a server from before it sends none
    exchange: d.exchange && typeof d.exchange === 'object' && int(d.exchange.credits) > 0 && Number.isFinite(d.exchange.price) && d.exchange.price >= 1e12
      ? { credits: int(d.exchange.credits), price: d.exchange.price, today: int(d.exchange.today) } : null,
  };
}
