// @ts-check
// What the credits store does to a company, as plain rules: no page, no Three.js, no network, no generated data.
// The server is the cashier (supabase/migrations/20261115000000_store.sql): it takes the credits and remembers what was
// sold. This file is what a purchase then does in the game:
//   * a repeat item arrives as a receipt, { id, item, at }, and is applied exactly once: its id is written into the
//     company's `store` block, which is saved with the company;
//   * an item owned for good is never written into the save: the server's answer says it is owned (`owns`), and
//     storeMods() folds it into the company's modifiers;
//   * a helper is owned too, perhaps with levels: the server counts the levels, and storeMods() sets the company's
//     modifier for it to the size of the level owned;
//   * a skip or a slot of the store's third part is one of the two: "Open the next yard", "New offers", "New goals" and
//     the "Star bonus" are receipts; the Bigger warehouse, the Third contract, the Fourth daily goal and the Family yard
//     are owned, and are modifiers the Company reads where the work happens (js/sim/company.js);
//   * the offers of the store's fourth part keep what they need in the same `store` block, in shapes it already had:
//     the piggy bank is `bank`; a purchase that found the bank empty waits as the flag `bankFull`;
//     the Monthly card's last day collected is `card`; an item the game hands out itself (the card's, the season's)
//     that can do nothing right now waits as the flag `due<item id>`;
//     the season is `pass`: its month, the points, and the steps collected (a step's gift as the step's number, a pass
//     holder's reward as 100 more); a closed season's rewards that wait for the server's word are the flag `owed<YYYYMM>`;
//     an Event ticket that was bought and not used yet is the flag `eventTicket`, and the event it started is a boost
//     under the event's name ('event' + its id) that changes no figure by itself: the Company reads it (eventsNow);
//   * EFFECTS says what each kind of item ("does") does. A new kind of item is a new entry there and nothing else.
// Every size (hours, minutes, factors) comes from the item's `params` in tools/credits/catalog.json, never from here.
import { fmt } from '../format.js';


const ID = /^[0-9]{1,15}(:[0-9]{1,3})?$/;     // a receipt's id: the ledger row, and for an item out of a bundle its place in it
const NAME = /^[A-Za-z][A-Za-z0-9]{0,30}$/;   // the name of a modifier or of a flag
const MAX_APPLIED = 200;                      // receipt ids remembered; the server hands out the newest 150 at most
export const MAX_BOOSTS = 12;
export const MAX_FLAGS = 20;                  // both save cleaners refuse a save with more
/** Closed months whose rewards may wait for the server's word at once (seasonStep): the oldest goes first. */
export const MAX_OWED = 3;
const MAX_BOOST_MS = 30 * 86400000;
const MAX_STEPS = 30;                         // a season's steps at most: a save keeps 60 claims, two for each (tools/credits/check.mjs)           // no boost runs further ahead than this, however many are bought or whatever a save says
const WORDS = { price: 'income', speed: 'machines', workerSpeed: 'workers' };
/** The player's local day number at `now` (days since 1970): the day the daily goals are drawn for (Company.refreshGoals). */
export const localDay = now => Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000);
/** What a helper's level is worth, in words, for the store's page. A stat without words is a helper with nothing to tell. */
const HELPER_WORDS = {
  runner: v => `the Runner carries ${fmt(v)} goods`,
  nightWatch: v => `one batch every ${fmt(v)} seconds`,
  awayPay: v => `${fmt(Math.round((v - 1) * 100))}% more pay for time away`,
};

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const wait = why => ({ kind: 'wait', why });

/** Where a receipt stands in time: ledger rows only grow, and the items of a bundle follow each other. */
export const rank = id => { const [row, place] = String(id).split(':'); return (Number(row) || 0) * 1000 + (Number(place) || 0); };

// --- the store block of a save ------------------------------------------------------------------------------------
/** @returns {{ applied: string[], boosts: { stat: string, value: number, until: number }[], flags: Record<string, { left: number, value: number }>, bank: number, pass: any, card: number|null }} */
/**
 * A trade of cash for credits the server has made (supabase/migrations/20261119000000_exchange.sql): the price comes out
 * of the cash and goes into the money spent, as the server did to the save it keeps, so the company's value is the same.
 * The cash never goes below nothing: the server checked it was there.
 */
export function tradeCash(econ, company, price) {
  if (!(price > 0)) return;
  econ.cash = Math.max(0, econ.cash - price);
  company.spent += price;
}

export function emptyStore() { return { applied: [], boosts: [], flags: {}, bank: 0, pass: null, card: null }; }

/**
 * The store block as a save has it, kept to what is known: anything else in it is dropped, and nothing in it can make
 * the game fail. @param saved  the `store` part of a company's save, or anything at all
 * @param now  wall-clock milliseconds: a boost's end is never further ahead of it than MAX_BOOST_MS
 */
export function loadStore(saved, now = Date.now()) {
  const s = emptyStore();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
  if (Array.isArray(saved.applied)) {
    s.applied = [...new Set(saved.applied.filter(id => typeof id === 'string' && ID.test(id)))].sort((a, b) => rank(a) - rank(b)).slice(-MAX_APPLIED);
  }
  for (const b of Array.isArray(saved.boosts) ? saved.boosts : []) {
    if (!b || typeof b !== 'object' || typeof b.stat !== 'string' || !NAME.test(b.stat) || !(num(b.value) > 0) || !(num(b.until) >= 1) || s.boosts.length >= MAX_BOOSTS) continue;
    s.boosts.push({ stat: b.stat, value: Math.min(num(b.value), 100), until: Math.min(Math.floor(num(b.until)), now + MAX_BOOST_MS) });
  }
  const flags = saved.flags && typeof saved.flags === 'object' && !Array.isArray(saved.flags) ? saved.flags : {};
  for (const [name, f] of Object.entries(flags)) {
    if (!NAME.test(name) || !f || typeof f !== 'object' || !(num(f.left) >= 1) || !(num(f.value) > 0) || Object.keys(s.flags).length >= MAX_FLAGS) continue;
    s.flags[name] = { left: Math.min(99, Math.floor(num(f.left))), value: Math.min(num(f.value), 100) };
  }
  s.bank = num(saved.bank);
  const p = saved.pass;
  if (p && typeof p === 'object' && typeof p.season === 'string' && p.season.length > 0 && p.season.length <= 64) {
    // only the steps a season can have (a gift: 1 to 30; a holder's reward: 101 to 130), each once: sixty claims are then always enough
    const claimed = [...new Set((Array.isArray(p.claimed) ? p.claimed : []).filter(n => Number.isInteger(n) && ((n >= 1 && n <= MAX_STEPS) || (n >= 101 && n <= 100 + MAX_STEPS))))];
    s.pass = { season: p.season, points: Math.floor(num(p.points)), claimed: claimed.slice(0, 2 * MAX_STEPS) };
  }
  if (num(saved.card) >= 1) s.card = Math.floor(num(saved.card));
  return s;
}

/** The block as it is saved, or undefined when nothing was ever bought: a save from before the store is then written back as it was. */
export function storeJSON(store) {
  if (!store.applied.length && !store.boosts.length && !Object.keys(store.flags).length && !(store.bank > 0) && !store.pass && store.card == null) return undefined;
  return { applied: store.applied, boosts: store.boosts, flags: store.flags, bank: Math.round(store.bank), pass: store.pass, card: store.card };
}

/**
 * Write a receipt down as applied. The list is kept in the order of the ledger and holds the newest MAX_APPLIED;
 * the oldest go first. (applyReceipts never applies a receipt older than a full list: it could not be written down.)
 */
export function markApplied(company, id) {
  const list = company.store.applied;
  if (typeof id !== 'string' || !ID.test(id) || list.includes(id)) return;
  list.push(id);
  list.sort((a, b) => rank(a) - rank(b));
  if (list.length > MAX_APPLIED) list.splice(0, list.length - MAX_APPLIED);
}

// --- what each kind of item does ------------------------------------------------------------------------------------

/** What a company would get from the goods in its warehouse that no running contract needs, at `factor` times normal or today's price, whichever is more. */
function clearance(company, factor) {
  let cash = 0, goods = 0;
  const lots = [];
  for (const item of Object.keys(company.stock)) {
    const free = company.freeStock(item);
    if (free <= 0) continue;
    const each = Math.max(company.price(item), company.econ.price(item) * factor);
    lots.push({ item, free, each });
    cash += free * each; goods += free;
  }
  return { cash: Math.floor(cash), goods, lots };
}
/**
 * The catalog's item that does `does`, or null. The piggy bank, the season, the Monthly card and the Event ticket are
 * one item each: the rules of each read their sizes from that item. On sale or not: "active": false stops the sale,
 * as for every other item, and what a player bought before is honoured (a card is collected to its last day, a ticket
 * is used, a bank is opened). Only the bank's filling asks whether the item is on sale (bankAdd).
 */
export function itemDoing(company, does) {
  const catalog = company.catalog || [];
  if (company.doing?.catalog !== catalog) company.doing = { catalog, found: new Map() };
  const found = company.doing.found;
  if (!found.has(does)) found.set(does, catalog.find(i => i.does === does) || null);
  return found.get(does);
}

// --- the piggy bank -------------------------------------------------------------------------------------------------
/**
 * The most the piggy bank holds: `hours` of the income the company is built for right now (Company.goalRef, the figure
 * a Cash pack is sized by). It grows with the company and falls with a sale of it. 0 where the catalog has no bank.
 * @param p  the bank item's params; left out, the catalog's
 */
export function bankCap(company, p = itemDoing(company, 'piggy')?.params) {
  return p ? Math.floor(company.goalRef() * 3600 * num(p.hours)) : 0;
}
/** What the bank holds, in whole dollars: never more than it can hold now. */
export function bankNow(company, p = itemDoing(company, 'piggy')?.params) {
  return Math.floor(Math.min(num(company.store.bank), bankCap(company, p)));
}
/**
 * Something was sold for `amount` (Company.income: a good at a shop, goods from the warehouse, a contract delivered):
 * the bank's share of it also goes into the bank, as far as it has room. The sale itself is paid in full by the
 * caller; the bank's money is new, and nobody has it until the bank is bought. Pay for time away, a time skip, a
 * goal's reward and a Cash pack are not sales, and put nothing in; nor does the building site: goods given to it are
 * not sold, and what a finished build pays goes through Company.earn(). Nor does anything go in while the catalog has
 * the bank off sale, unless a purchase waits for a full bank (bankDue): a bank nobody can open is not filled, and one
 * that was paid for fills until it opens. What is in it stays.
 */
export function bankAdd(company, amount) {
  const item = itemDoing(company, 'piggy'), p = item?.params;
  if (!p || !(amount > 0) || (item.active === false && !company.store.flags.bankFull)) return;
  const cap = bankCap(company, p);
  company.store.bank = Math.min(cap, Math.min(num(company.store.bank), cap) + amount * Math.min(1, num(p.share)));
}
/**
 * A purchase of the bank that found it empty waits for a full one (the flag `bankFull`): the moment the bank is full
 * it is opened for that purchase. Where the catalog no longer has a bank nothing can fill it: the purchase then pays
 * what is in it, and the flag is used.
 * @returns {{ cash: number, gone: boolean }|null}  what was paid (gone: the catalog has no bank), or null when nothing was opened
 */
export function bankDue(company) {
  if (!company.store.flags.bankFull) return null;
  const gone = !itemDoing(company, 'piggy'), cap = bankCap(company);
  if (!gone && (!(cap >= 1) || num(company.store.bank) < cap)) return null;
  const cash = gone ? Math.floor(num(company.store.bank)) : cap;
  useFlag(company, 'bankFull');
  company.store.bank = 0;
  if (cash > 0) company.earn(cash);
  return { cash, gone };
}

/** How many materials the input pads of these machines still take. */
const padRoom = sims => sims.reduce((n, s) => n + Math.max(0, s.inputCap - s.inputs) + (s.two ? Math.max(0, s.inputCap - s.inputs2) : 0), 0);

/**
 * What each `does` of the catalog does. For every entry:
 *   earning  true: it changes what a company earns (the server then moves the buyer to the boosted ranking);
 *            null: it has no effect of its own (a bundle earns when something in it does)
 *   kind     the kind of item it is sold as; modes: how it may be sold ('repeat': by receipt; 'once': owned)
 *   params   the numbers and names it needs in the item's "params": 'number' (above 0) or the list of allowed words.
 *            tools/credits/check.mjs refuses an item whose params, kind, mode or "earning" do not match.
 *   hand     true: the game may hand this item out itself, as the Monthly card and the season do (handOut): cash and
 *            timed boosts, which need no choice and nothing of the yards
 *   worth(company, params, now, sims?)  what it would do right now: { cash?, goods?, note? } (note: a few words for the
 *            store's page), or { why } when it could do nothing
 *   apply(company, params, now)  do it for one receipt and say what was done: { kind, ... }; { kind: 'wait', why } when it
 *            can do nothing now (the receipt is kept); { kind: 'world', work } when the game has to do it in the yards;
 *            null when the item's params are unusable (the receipt is left alone). An entry without apply is never a receipt.
 */
/** The stats of `perm` that only a founded company has: before it is founded, what they give waits. */
const COMPANY_STATS = ['storage', 'contractPay', 'contractSlots', 'dailyGoals', 'familyYard'];
export const EFFECTS = {
  /** Cash worth `hours` of the income the company is built for: the figure the goals are sized by, never less than the first yard's. */
  cash_hours: {
    earning: true, kind: 'boost', modes: ['repeat'], params: { hours: 'number' }, hand: true,
    worth: (company, p) => ({ cash: Math.floor(company.goalRef() * 3600 * num(p.hours)) }),
    apply(company, p) {
      const cash = Math.floor(company.goalRef() * 3600 * num(p.hours));
      if (!(cash > 0)) return null;
      company.earn(cash);
      return { kind: 'cash', cash };
    },
  },
  /** `stat` times `value` for `minutes`, by the wall clock. The same boost bought again adds its time to the one running. */
  boost: {
    earning: true, kind: 'boost', modes: ['repeat'], params: { stat: ['price', 'speed', 'workerSpeed'], value: 'number', minutes: 'number' }, hand: true,
    /** The place it takes among the MAX_BOOSTS that can run (handRoom): one of the same stat and value that runs takes its time instead. */
    slot: p => (typeof p.stat === 'string' && num(p.value) > 0 ? `${p.stat}:${Math.min(num(p.value), 100)}` : null),
    apply(company, p, now) {
      const value = Math.min(num(p.value), 100), ms = num(p.minutes) * 60000;
      if (typeof p.stat !== 'string' || !NAME.test(p.stat) || !(value > 0) || !(ms > 0)) return null;
      const boosts = company.store.boosts;
      let b = boosts.find(x => x.stat === p.stat && x.value === value && x.until > now);
      if (b) b.until = Math.min(b.until + ms, now + MAX_BOOST_MS);
      else {
        if (boosts.length >= MAX_BOOSTS) return wait('Too many boosts are running.');
        b = { stat: p.stat, value, until: now + ms };
        boosts.push(b);
      }
      return { kind: 'boost', stat: b.stat, value, until: b.until, minutes: Math.ceil((b.until - now) / 60000) };
    },
  },
  /**
   * Owned for good: `stat` times `value` ('mult'), at least `value` ('set'), or `value` more ('add'). Folded in by
   * storeMods(); never a receipt. Three of the stats are the store's own: `crew` (extra workers in every yard),
   * `dailyGoals` (daily goals beyond the usual three) and `familyYard` (above 0: the first yard keeps what was bought
   * in it through a sale of the company).
   */
  perm: {
    earning: true, kind: 'upgrade', modes: ['once'],
    params: { stat: ['price', 'speed', 'workerSpeed', 'storage', 'contractPay', 'contractSlots', 'offlineCap', 'offlineShare', 'capacity', 'crew', 'dailyGoals', 'familyYard'],
      value: 'number', op: ['mult', 'set', 'add'] },
    /** Owned for good, so sold at any time; a stat of the company itself (the warehouse, contracts, daily goals, a sale) says when it starts to count. */
    worth(company, p) { return !company.founded && COMPANY_STATS.includes(p.stat) ? { note: 'Counts once your company is founded.' } : {}; },
  },
  /** Paid as `hours` of time away at full speed: what the workers bring in, less wages and upkeep. Outside the daily allowance. */
  skip_hours: {
    earning: true, kind: 'skip', modes: ['repeat'], params: { hours: 'number' },
    worth(company, p) {
      const cash = Math.floor(Math.max(0, num(company.econ.workerRate) - company.costRate()) * 3600 * num(p.hours));
      return cash >= 1 ? { cash } : { why: 'Your workers earn nothing yet.' };
    },
    apply(company, p) {
      if (!(num(p.hours) > 0)) return null;
      const w = this.worth(company, p);
      if (w.why) return wait(w.why);
      company.earn(w.cash);
      return { kind: 'cash', cash: w.cash };
    },
  },
  /**
   * One more use of the flag `name`, worth `value`: 'awayX2' multiplies the next pay for time away, 'contractBonus' the
   * next contract delivered, 'starBonus' the stars of the next sale of the company (Company.sellOffer). A sale may be
   * weeks away, so a Star bonus is sold only while a sale is possible and none waits: it is bought to be used.
   */
  flag: {
    earning: true, kind: 'boost', modes: ['repeat'], params: { name: ['awayX2', 'contractBonus', 'starBonus'], value: 'number' },
    worth(company, p) {
      if (p.name !== 'starBonus') return {};
      const o = company.sellTerms(), more = Math.floor(o.plain * num(p.value)) - o.plain;
      if (!o.allowed) return { why: `A sale of the company needs ${o.min} fully built yards. You have ${o.yards}.` };
      if (company.store.flags.starBonus?.left > 0) return { why: 'A Star bonus already waits for your next sale.' };   // the flag's word, whether or not it raises a sale now
      return more > 0 ? { note: `${fmt(more)} more star${more === 1 ? '' : 's'} for a sale now` } : { why: 'A sale now would pay no more stars with it.' };
    },
    apply(company, p) {
      const value = Math.min(num(p.value), 100), flags = company.store.flags;
      if (typeof p.name !== 'string' || !NAME.test(p.name) || !(value > 0)) return null;
      if (!flags[p.name] && Object.keys(flags).length >= MAX_FLAGS) return null;
      const left = Math.min(99, (flags[p.name]?.left || 0) + 1);
      flags[p.name] = { left, value };
      return { kind: 'flag', name: p.name, left };
    },
  },
  /** The running stage of the building site gets every good it still needs. */
  finish_stage: {
    earning: true, kind: 'skip', modes: ['repeat'], params: {},
    worth(company) {
      if (!company.siteOpen || !company.site.at) return { why: 'No build is running.' };
      return { goods: company.siteNeeds().reduce((n, g) => n + Math.max(0, g.need - g.have), 0) };
    },
    apply(company) {
      const w = this.worth(company);
      if (w.why) return wait(w.why);
      for (const g of company.siteNeeds().filter(x => x.need > x.have)) company.give(g.item, g.need - g.have);   // the last one finishes the stage
      return { kind: 'stage', goods: w.goods };
    },
  },
  /** Every machine's input pads are filled once. The machines are the game's: it does the work (fillMachines) and writes the receipt down. */
  fill_machines: {
    earning: true, kind: 'skip', modes: ['repeat'], params: {},
    worth: (company, p, now, sims) => (sims && padRoom(sims) <= 0 ? { why: 'Every machine is full.' } : {}),
    apply: () => ({ kind: 'world', work: 'fill_machines' }),
  },
  /** Every warehouse good no running contract needs is sold at `value` times the normal price, or at today's price where that is more. */
  clearance: {
    earning: true, kind: 'skip', modes: ['repeat'], params: { value: 'number' },
    worth(company, p) {
      const sale = clearance(company, num(p.value));
      return sale.goods > 0 ? { cash: sale.cash, goods: sale.goods } : { why: 'The warehouse holds nothing to sell.' };
    },
    apply(company, p) {
      if (!(num(p.value) > 0)) return null;
      const sale = clearance(company, num(p.value));
      if (!sale.goods) return wait('The warehouse holds nothing to sell.');
      for (const lot of sale.lots) {
        company.stock[lot.item] -= lot.free;
        if (company.stock[lot.item] <= 0) delete company.stock[lot.item];
        // the yard was credited with these goods at the normal price when they were stocked: only what the sale added is new
        if (company.maker[lot.item]) company.book(company.maker[lot.item]).sales.add(lot.free * (lot.each - company.econ.price(lot.item)));
      }
      company.income(sale.cash);
      return { kind: 'sold', cash: sale.cash, goods: sale.goods };
    },
  },
  /**
   * The gate out of the newest open yard is paid: what it still costs is put down, and the next yard is open. Only
   * once the gate is that yard's next purchase (Company.nextGate): until then, and when every yard is open, the
   * purchase is kept. The rules do all of it here, so the save is right whatever happens next; the game then shows
   * it (js/game/store.js, showGate).
   */
  open_gate: {
    earning: true, kind: 'skip', modes: ['repeat'], params: {},
    worth(company) {
      const g = company.nextGate();
      if (!g) return { why: 'Every yard is open.' };
      if (!g.due) return { why: `Buy every upgrade of ${g.from} first: its gate comes last.` };
      return { cash: Math.ceil(g.cost), note: `Opens ${g.name}` };
    },
    apply(company) {
      const g = company.nextGate(), w = this.worth(company);
      if (w.why) return wait(w.why);
      const e = company.econ, u = e.get(g.id);
      e.paid[g.id] = u.cost; e.unlocked[g.id] = true;
      if (!e.areas.includes(g.next)) e.areas.push(g.next);
      company.refreshCosts(); company.sync();   // the founding, the milestones of yards and the tabs follow the yards
      return { kind: 'gate', gate: g.id, yard: g.yard, name: g.name, cash: Math.ceil(g.cost) };
    },
  },
  /** The contract board is drawn again now, whatever the wait of the free button (Company.redrawOffers). */
  redraw_offers: {
    earning: true, kind: 'skip', modes: ['repeat'], params: {},
    worth(company) {
      if (!company.founded) return { why: 'Contracts come with your company.' };
      const { changed, offers } = company.offersRedraw(), size = offers.length;
      if (!changed) return { why: 'No other offers can be drawn right now.' };
      return { note: changed < size ? `Changes ${changed} of the ${size} offers on the board` : size === 1 ? 'Changes the one offer on the board' : `Changes all ${size} offers on the board` };
    },
    apply(company) {
      const w = this.worth(company);
      if (w.why) return wait(w.why);
      return { kind: 'offers', offers: company.redrawOffers() };
    },
  },
  /** Today's unfinished daily goals are drawn again (Company.redrawGoals). A goal that is done or collected is never touched. */
  redraw_goals: {
    earning: true, kind: 'skip', modes: ['repeat'], params: {},
    worth(company, p, now) {
      if (!company.founded || !company.goals.daily.length) return { why: 'Daily goals come with your company.' };
      // after local midnight, before the day's goals are drawn: yesterday's list is about to be replaced, and a purchase spent on it would be lost
      if (now > 0 && company.goals.day < localDay(now)) return { why: 'Today\'s goals have not been drawn yet. They come in a moment.' };
      const { goals, open } = company.goalsToRedraw(), n = goals.length;
      if (!open) return { why: 'Today\'s goals are all done.' };
      if (!n) return { why: 'There is no other goal to draw today.' };
      const which = n < open ? `${n} of the ${open} unfinished goals` : n === 1 ? 'the one unfinished goal' : n === 2 ? 'both unfinished goals' : `all ${n} unfinished goals`;
      // a drawn goal starts from nothing: the player is told before buying whose progress that throws away
      const moved = goals.filter(g => g.value > 0).length;
      const lost = !moved ? '' : n === 1 ? '; its progress starts over' : moved < n ? `; progress on ${moved} of them starts over` : n === 2 ? '; progress on both starts over' : `; progress on all ${n} starts over`;
      return { note: `Draws ${which} again${lost}` };
    },
    apply(company, p, now) {
      const w = this.worth(company, p, now);
      if (w.why) return wait(w.why);
      return { kind: 'goals', goals: company.redrawGoals() };
    },
  },
  /**
   * The piggy bank is broken open: everything in it is paid, and it starts to fill again. `share` of every sale goes
   * in (bankAdd), up to `hours` of the income the company is built for (bankCap). A bank with less than a dollar in it
   * is not sold. A purchase that arrives all the same (a second device, a save that was lost) is not spent on nothing
   * and not on the first dollar either: it is written down as applied, and waits in the save for a full bank (bankDue).
   */
  piggy: {
    earning: true, kind: 'offer', modes: ['repeat'], params: { share: 'number', hours: 'number' },
    worth(company, p) {
      const cap = bankCap(company, p), cash = bankNow(company, p), flags = company.store.flags, fill = cap >= 1 ? Math.min(1, cash / cap) : 0;
      if (flags.bankFull) return { why: `A purchase already waits for the bank to fill. It opens at $${fmt(cap)}.`, fill };
      if (cash < 1) return { why: `The piggy bank is empty. It fills as you sell, up to $${fmt(cap)}.` };
      // no room in the save to write a waiting purchase down: one that arrived while the bank is empty could only wait for a full one (apply)
      if (Object.keys(flags).length >= MAX_FLAGS && cash < cap) return { why: 'Too much waits in your game already: until something of it is used, the piggy bank is sold only when it is full.', fill };
      return { cash, fill, note: cash >= cap ? `It is full: it holds no more than $${fmt(cap)}` : `It fills as you sell, up to $${fmt(cap)}` };
    },
    apply(company, p) {
      if (!(num(p.share) > 0) || !(num(p.hours) > 0)) return null;
      const cash = bankNow(company, p), flags = company.store.flags, room = !!flags.bankFull || Object.keys(flags).length < MAX_FLAGS;
      // Without room for the flag the purchase cannot be written down as waiting, and is tried again every second: it is
      // then opened only on a full bank, as a purchase with its flag is (worth() sells a bank that is not full only with room).
      if (cash >= 1 && (room || cash >= bankCap(company, p))) { company.store.bank = 0; company.earn(cash); return { kind: 'cash', cash }; }
      if (!room) return wait('The piggy bank opens for this purchase once it is full.');
      flags.bankFull = { left: Math.min(99, (flags.bankFull?.left || 0) + 1), value: 1 };
      return { kind: 'bank', left: flags.bankFull.left };
    },
  },
  /**
   * The Season pass: held until the server's month ends (a pass). The season itself runs for everyone (seasonPoints,
   * seasonCollect): `daily` and `weekly` points for a goal collected, `points` for a step, `steps` steps, and
   * `gift_minutes` of the income the company is built for as each step's cash gift. A holder also gets, with step n,
   * the n-th of `rewards`, taken in turn. Never a receipt. In the season's last `last_minutes` minutes (by the server's
   * clock once it has answered) the pass is not sold: a purchase that reaches the server after midnight UTC buys the
   * next month's pass, and the boosts the row would promise at once would not be given.
   */
  season: {
    earning: true, kind: 'offer', modes: ['pass'],
    params: { steps: 'whole', points: 'whole', daily: 'whole', weekly: 'whole', gift_minutes: 'number', rewards: 'items', last_minutes: 'number' },
    worth(company, p) {
      const s = seasonState(company);
      if (!s) return {};
      const now = (seasonTime(company) || { now: company.wall() }).now, last = num(p.last_minutes) * 60000;
      if (last > 0 && now < s.ends && s.ends - now <= last) return { why: `The season ends in under ${fmt(num(p.last_minutes))} minute${num(p.last_minutes) === 1 ? '' : 's'}. The pass of the next month is on sale from midnight UTC.` };
      return { note: s.behind > 0 ? `You are at step ${s.step} of ${s.steps}: ${s.behind === 1 ? 'its boost is' : `${s.behind} boosts are`} yours to collect at once` : `You are at step ${s.step} of ${s.steps} this season` };
    },
  },
  /**
   * The Monthly card: owned for its days (a pass), and while it is, the items in `gives` can be collected once a day
   * (cardState, cardCollect). Never a receipt: what it gives is handed out by the game, through those items' own effects.
   */
  card: { earning: true, kind: 'offer', modes: ['pass'], params: { gives: 'items' } },
  /**
   * An Event ticket: a company event of the player's choice runs for `hours`. A receipt cannot say which event, so a
   * purchase is a ticket that waits in the save (the flag `eventTicket`) until the player has chosen
   * (Company.useTicket): nothing is spent before the choice, and the choice is in the save the moment it is made.
   * While a ticket waits no second one is sold. The flag's value is the hours it was bought for (the most of those that
   * wait), so that a ticket is used for its hours whatever the catalog says later, or when its row is gone.
   */
  event_ticket: {
    earning: true, kind: 'offer', modes: ['repeat'], params: { hours: 'number' },
    worth(company) {
      if (!company.founded) return { why: 'Events come with your company.' };
      if (company.store.flags.eventTicket) return { why: 'A ticket waits: choose its event first.' };
      return { note: 'You choose the event after buying' };
    },
    apply(company, p) {
      const flags = company.store.flags;
      if (!(num(p.hours) > 0)) return null;
      if (!flags.eventTicket && Object.keys(flags).length >= MAX_FLAGS) return wait('Too much is waiting already.');
      flags.eventTicket = { left: Math.min(99, (flags.eventTicket?.left || 0) + 1), value: Math.max(num(flags.eventTicket?.value), Math.min(100, num(p.hours))) };
      return { kind: 'ticket', left: flags.eventTicket.left };
    },
  },
  /**
   * A bundle: the server hands out what is in it ("grants"), each as a receipt or an owned item of its own. Sold once,
   * or as a pass: then it is sold again when its days are over (the Weekly bundle: once in seven days).
   */
  bundle: { earning: null, kind: 'offer', modes: ['once', 'pass'], params: {} },
  /**
   * A helper, owned for good, with one level or more: the company's modifier `stat` becomes `levels[level - 1]`.
   * Folded in by storeMods(); never a receipt. With one level it is sold once; with more it is sold level by level, and
   * the server counts them (the item's "max_count" is the number of levels, tools/credits/check.mjs).
   *   noWait      1: the player picks up and drops without the wait between two goods
   *   outputCap   every machine's output pad holds this many times as much
   *   runner      one more worker in the yard the player stands in, who carries this many goods
   *   nightWatch  a machine standing for want of material makes one batch for every this many seconds it stands
   *   awayPay     the pay for time away is multiplied by this
   */
  helper: {
    earning: true, kind: 'helper', modes: ['once', 'repeat'],
    params: { stat: ['noWait', 'outputCap', 'runner', 'nightWatch', 'awayPay'], levels: 'numbers' },
  },
  /**
   * The Advisor names the best next purchase and how soon it pays back (Company.nextPurchases, js/sim/advice.js). It
   * tells; it presses nothing and changes no number, so what the company earns stays the player's own doing.
   */
  advisor_pro: {
    earning: false, kind: 'helper', modes: ['once'], params: {},
    worth(company) {
      if (!company.founded) return { why: 'The Advisor opens with your Headquarters.' };
      return company.nextPurchases().length ? {} : { why: 'Every yard is fully built.' };
    },
  },
};

// --- what the game hands out itself ---------------------------------------------------------------------------------
/** The id of an item the game hands out itself: it is part of a flag's name in the save (`due<id>`, NAME), so 2 to 21 lower-case letters and digits. tools/credits/check.mjs holds the catalog to it. */
export const HANDED = /^[a-z][a-z0-9]{1,20}$/;
const DUE = /^due([a-z][a-z0-9]{1,20})$/;
/** Why an item the game hands out can be given neither now nor later: in plain words, for the card, the season and the Goals tab. */
const noRoom = item => `${item.name} cannot start while ${MAX_BOOSTS} boosts run, and your game has no room left for it to wait.`;
/**
 * Can every one of `ids` be handed out now, in this order: started, or written down to wait (`due<id>`)? Asked before
 * anything is given, so that a day of the card or a step of the season is never used up on something that is lost.
 * An item that is never handed out (handOut answers null for it) needs no room.
 * @returns the first item that could neither start nor wait, or null when every one can
 */
export function handRoom(company, ids, now) {
  const store = company.store, running = new Set(store.boosts.filter(b => b.until > now).map(b => `${b.stat}:${b.value}`)), waiting = new Set(Object.keys(store.flags));
  let boosts = store.boosts.length;   // as a boost's apply counts them: one that ended is still there until tickStore
  for (const id of ids) {
    const item = (company.catalog || []).find(i => i.id === id), effect = item ? EFFECTS[item.does] : null;
    if (!item || !effect?.hand || typeof effect.apply !== 'function' || !HANDED.test(id)) continue;
    const slot = effect.slot?.(item.params || {});
    if (!slot || running.has(slot)) continue;            // cash, or a boost that adds its time to one that runs
    if (boosts < MAX_BOOSTS) { running.add(slot); boosts++; continue; }
    if (waiting.has('due' + id) || waiting.size < MAX_FLAGS) { waiting.add('due' + id); continue; }
    return item;
  }
  return null;
}
/**
 * Hand out one item of the catalog, as the Monthly card and the season do: through the very effect a purchase of it
 * has, so a Cash pack from the card is a Cash pack. An effect that can do nothing right now ({ kind: 'wait' }) does
 * not lose the item: it waits in the save as the flag `due<id>` and is given by settleDue(), once.
 * @returns {{ item: any, done: any }|null}  what was done (done.kind 'wait': it is kept; 'full': it could not start and
 *   there is no room in the save for it to wait, so nothing was done: done.why says so), or null when this item cannot
 *   be handed out (the catalog does not have it, its effect is not one the game hands out, or it has no usable sizes)
 */
export function handOut(company, id, now) {
  const item = (company.catalog || []).find(i => i.id === id), effect = item ? EFFECTS[item.does] : null;
  if (!item || !effect || !effect.hand || typeof effect.apply !== 'function' || !HANDED.test(id)) return null;
  const done = effect.apply(company, item.params || {}, now);
  if (!done) return null;
  if (done.kind === 'wait') {
    const flags = company.store.flags, name = 'due' + id;
    if (!flags[name] && Object.keys(flags).length >= MAX_FLAGS) return { item, done: { kind: 'full', why: noRoom(item) } };
    flags[name] = { left: Math.min(99, (flags[name]?.left || 0) + 1), value: 1 };
  }
  if (done.kind === 'boost') company.applyMods();   // a new boost counts from this moment
  return { item, done };
}
/**
 * Give what was handed out and had to wait, as far as it can be given now. Called once a second by the game.
 * @returns {{ item: any, done: any }[]}  what was given now; what still waits is not in the list
 */
export function settleDue(company, now) {
  const out = [], flags = company.store.flags;
  for (const name of Object.keys(flags)) {
    const id = DUE.exec(name)?.[1], item = id ? (company.catalog || []).find(i => i.id === id) : null, effect = item ? EFFECTS[item.does] : null;
    if (!effect || !effect.hand || typeof effect.apply !== 'function') continue;   // an item this copy of the game does not know: it goes on waiting
    while (flags[name]) {
      const done = effect.apply(company, item.params || {}, now);
      if (!done || done.kind === 'wait') break;
      useFlag(company, name);
      out.push({ item, done });
    }
  }
  if (out.some(d => d.done.kind === 'boost')) company.applyMods();
  return out;
}
/** What waits to be given: [{ item, left }], for the store's page. */
export function dueList(company) {
  return Object.entries(company.store.flags).map(([name, f]) => ({ item: (company.catalog || []).find(i => i.id === DUE.exec(name)?.[1]), left: f.left })).filter(d => d.item);
}

// --- the Monthly card -------------------------------------------------------------------------------------------------
/**
 * The Monthly card as it stands today: { item, owned, taken, ready, gives }, or null where the catalog has no card.
 * The server sells the card and says until when it is owned; the day it was last collected is the save's (`card`).
 * @param day   the player's day number (days since 1970 by their own calendar, as the goals count them)
 * @param last  the last day the card may be collected for, the day its 30 days run out; left out, none is known
 *   owned: the server says so in this visit. taken: today's was collected (or the clock stands before the last day
 *   collected: a day earlier than the last one seen changes nothing). ready: there is something to collect now.
 *   final: today is the card's last day (or later): there is no tomorrow's.
 */
export function cardState(company, day, last = Infinity) {
  const item = itemDoing(company, 'card');
  if (!item) return null;
  const d = Math.floor(num(day)), owned = company.owns(item.id) === true, taken = num(company.store.card) >= d;   // a day, whatever hours it is given with
  const gives = (Array.isArray(item.params?.gives) ? item.params.gives : []).map(id => (company.catalog || []).find(i => i.id === id)).filter(Boolean);
  return { item, owned, taken, ready: owned && !taken && d >= 1 && d <= Math.floor(last), final: d >= Math.floor(last), gives };
}
/**
 * Collect today's from the Monthly card: each item it gives is handed out (handOut), and the day is written down. One
 * that cannot start right now waits; the day is collected all the same, so nothing of it is lost at midnight. When
 * one of them could neither start nor wait (handRoom), nothing is collected and the day is not used up.
 * @returns {{ day: number, gave: { item: any, done: any }[], full?: { item: any, why: string } }|null}  null when there
 *   is nothing to collect; `full`: nothing was collected, and why
 */
export function cardCollect(company, day, now, last = Infinity) {
  const s = cardState(company, day, last);
  if (!s || !s.ready) return null;
  const stuck = handRoom(company, s.gives.map(g => g.id), now);
  if (stuck) return { day: Math.floor(num(day)), gave: [], full: { item: stuck, why: `Nothing was collected: ${noRoom(stuck)} Collect today's once a boost has ended.` } };
  company.store.card = Math.floor(num(day));
  return { day: company.store.card, gave: s.gives.map(g => handOut(company, g.id, now)).filter(Boolean) };
}

// --- the season -------------------------------------------------------------------------------------------------------
// A season is a calendar month by UTC: the server's calendar, because the server sells the pass until its own month
// ends. Every player has a season, with or without the store: goals collected give points, points make steps, and a
// step gives a small cash gift. A holder of the Season pass also gets a boost with each step. What the server vouches
// for is the pass (who held it for which month); the points and what was collected are the save's, as cash is.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SEASON = /^[0-9]{4}-(0[1-9]|1[0-2])$/, OWED = /^owed([0-9]{4})(0[1-9]|1[0-2])$/;
/** The season a moment belongs to, as 'YYYY-MM', or null for a clock that is no time at all (it must stop nothing). */
export const seasonOf = now => {
  const t = typeof now === 'number' ? now : NaN;
  return Number.isFinite(t) && Math.abs(t) <= 8.64e15 ? new Date(t).toISOString().slice(0, 7) : null;
};
/** When a season ends: the first moment of the next month by UTC, in milliseconds. */
export const seasonEnd = season => Date.UTC(Number(season.slice(0, 4)), Number(season.slice(5, 7)), 1);
/** "November", for 'YYYY-11'. */
export const seasonName = season => MONTHS[Number(season.slice(5, 7)) - 1] || season;
/** The season item's sizes as whole numbers. No more than 30 steps: a save keeps 60 claims, two for each step. */
function seasonSizes(item) {
  const p = item?.params || {};
  return { steps: Math.min(MAX_STEPS, Math.floor(num(p.steps))), per: Math.max(1, Math.floor(num(p.points))), daily: Math.floor(num(p.daily)), weekly: Math.floor(num(p.weekly)),
    minutes: num(p.gift_minutes), rewards: Array.isArray(p.rewards) ? p.rewards.filter(id => typeof id === 'string') : [] };
}
/** How many steps of each track were collected: gifts are collected in order from step 1, and so are a holder's rewards (step + 100). */
function collected(pass, steps) {
  const set = new Set(pass?.claimed || []);
  let free = 0, held = 0;
  while (free < steps && set.has(free + 1)) free++;
  while (held < steps && set.has(101 + held)) held++;
  return { free, held };
}
/** The season's clock: { now, sure, moved? } (sure: it is the server's; moved: the device's date moved since the server's last answer), or null while the server's answer is on its way. */
const seasonTime = company => (typeof company.seasonTime === 'function' ? company.seasonTime() : { now: company.wall(), sure: false });
/**
 * Was the Season pass held for that season? true, false, null when nobody can tell yet (the store has not answered in
 * this visit, or nothing has told the Company), or 'forgotten' when nobody can tell any more: the month is older than
 * what the store remembers (js/credits.js, heldMonth). Such a month is never taken for "held" (that would hand a
 * marked item's boost to a player who never held a pass) and never for "not held" without a word: what it owed is
 * dropped, and the player is told (toldForgotten).
 */
const heldFor = (company, item, season) => (typeof company.heldSeason === 'function' ? company.heldSeason(item.id, season) : null);
const FORGOTTEN = 'forgotten';
/** Say, once, that the rewards a closed month owed could no longer be checked with the store. @param n  how many */
function toldForgotten(company, season, n) {
  const month = seasonName(season);
  company.notice('Season pass', `The rewards of ${month} could no longer be checked`, `If you held the Season pass of ${month}, ${n === 1 ? 'its reward' : `its ${n} rewards`} you had not collected could not be checked: the store no longer remembers that month.`, 'gem');
}

/**
 * The season as it stands, for the Goals tab and the store's page, or null where the catalog has no season:
 * { item, season, name, ends, points, per, steps, step, toNext, gift, gifts, free, held, holder, unknown, rewards, behind, next, stuck }
 *   step: steps reached; toNext: points to the next step (0 at the last); gift: what one step's gift pays now;
 *   gifts: gifts reached and not collected; free, held: gifts and holder's rewards collected so far; holder: the pass is held for this season (the server said so in this visit);
 *   unknown: the store has not answered, so nobody can tell; rewards: a holder's rewards reached and not collected
 *   (0 for anyone else); behind: what a pass bought now would let the player collect at once; next: the item the next
 *   reward is; stuck: why the next reward can neither start nor wait now (handRoom), or null.
 */
export function seasonState(company) {
  const item = itemDoing(company, 'season');
  if (!item) return null;
  const z = seasonSizes(item), t = seasonTime(company) || { now: company.wall(), sure: false }, p = company.store.pass;
  const season = p && SEASON.test(p.season) ? p.season : seasonOf(t.now) || seasonOf(company.wall());
  if (!season) return null;   // no season in the save, and no clock that is a time
  const points = p ? Math.min(z.steps * z.per, Math.floor(num(p.points))) : 0;
  const step = Math.min(z.steps, Math.floor(points / z.per)), had = collected(p, z.steps), held = heldFor(company, item, season);
  const reward = n => (z.rewards.length ? (company.catalog || []).find(i => i.id === z.rewards[(n - 1) % z.rewards.length]) || null : null);
  const rewards = held === true ? Math.max(0, step - had.held) : 0, next = reward(had.held + 1);
  return { item, season, name: seasonName(season), ends: seasonEnd(season), points, per: z.per, steps: z.steps, step, toNext: step >= z.steps ? 0 : z.per - points % z.per,
    gift: Math.floor(company.goalRef() * 60 * z.minutes), gifts: Math.max(0, step - had.free), free: had.free, held: had.held,
    holder: held === true, unknown: held == null, rewards, behind: Math.max(0, step - had.held), next,
    stuck: rewards > 0 && next && handRoom(company, [next.id], company.wall()) ? noRoom(next) : null };
}
/** The flags of closed seasons whose rewards wait for the server's word: [name], oldest first. */
const owedFlags = company => Object.keys(company.store.flags).filter(n => OWED.test(n)).sort();
/**
 * Keep no more than `keep` closed months owed: the oldest go first, and the player is told of each, once. A month is
 * owed until the server says whether its pass was held, so a player who never reaches the server would otherwise keep
 * one more flag each month, and the save holds 20 at most.
 * @returns true when one went
 */
function dropOwed(company, keep) {
  const names = owedFlags(company);
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    const f = company.store.flags[name], m = OWED.exec(name), month = seasonName(`${m[1]}-${m[2]}`), n = Math.floor(num(f.left));
    delete company.store.flags[name];
    company.notice('Season pass', `The rewards of ${month} could no longer be kept`, `If you held the Season pass of ${month}, ${n === 1 ? 'its reward' : `its ${n} rewards`} could not be checked with the store in time: the rewards of only the last ${MAX_OWED} months wait for its word.`, 'gem');
  }
  return names.length > keep;
}
/**
 * Hand out a closed season's rewards for a holder: `count` of them from step `first` (never past the season's last
 * step, whatever a save claims), each only while it can start or wait (handRoom). What has no room stays owed in the
 * flag `name`, from the first reward not given; the last one may take that flag's own place.
 * @returns what was handed out
 */
function payOwed(company, z, name, first, count) {
  const flags = company.store.flags, gave = [], last = Math.min(z.steps, first + count - 1), now = company.wall();
  // a month closing with the word in hand has no flag yet: its place is kept first, so that a reward waiting in the
  // save (`due<id>`) never takes the last place and leaves the rewards after it with nowhere to be owed
  if (!flags[name] && first <= last && Object.keys(flags).length < MAX_FLAGS) flags[name] = { left: last - first + 1, value: first };
  let n = first;
  for (; n <= last; n++) {
    const id = z.rewards[(n - 1) % z.rewards.length], kept = flags[name];
    if (n === last) delete flags[name];
    if (handRoom(company, [id], now)) { if (kept) flags[name] = kept; break; }
    const g = handOut(company, id, now);
    if (g) gave.push(g);
  }
  if (n > last) delete flags[name];
  else if (flags[name] || Object.keys(flags).length < MAX_FLAGS) flags[name] = { left: last - n + 1, value: n };
  return gave;
}
/** Say what a closed season's rewards that were handed out did: what started and what waits, a line each (a name may hold a comma). */
function toldOwed(company, season, gave) {
  if (gave.length) company.notice('Season pass', `${gave.length === 1 ? 'A reward' : `${gave.length} rewards`} of the season of ${seasonName(season)}`, [`You had not collected ${gave.length === 1 ? 'it' : 'them'}:`, ...gave.map(g => receiptLine(g.item, g.done))].join('\n'), 'gem');
}

/**
 * The month has turned, or the store has answered: close a season that is over, and settle what a closed season
 * still owes. Called by the Company once in a while, before points are added or a step is collected, and by the game
 * when the server's answer changes. Nothing happens while the server's answer is on its way (the clock is then not
 * known to be right), and a season later than the clock's month is left alone unless the clock is the server's: a
 * device's clock set back changes nothing. A month closes on the server's clock, or on the device's while it has not
 * moved since the server's last answer (`moved`, js/credits.js): a date set forward in airplane mode closes nothing.
 *   * the gifts of the closed season that were reached and not collected are paid at once: cash does not spoil;
 *   * a holder's rewards that were reached and not collected are owed (`owed<YYYYMM>`: how many, from which step) until
 *     the server says whether the pass of that season was held: then they are handed out, or dropped; and when the
 *     server no longer remembers that month (heldFor: 'forgotten') they are dropped and the player is told. They are handed
 *     out as far as each can start or wait (handRoom), and the rest stays owed. With the server's word in hand at the
 *     close they are handed out at once. The months already owed are settled before a month closes. No more than
 *     MAX_OWED months stay owed while the word is not in hand (dropOwed): a month is dropped only to write a flag for
 *     one that closes without it, never one the word says was held.
 *   * a month that closes with the word in hand and whose rewards cannot all start or wait now keeps the rest owed in
 *     its flag (payOwed keeps the flag's place before anything else takes it), and they are given once there is room.
 *   * a month that would owe rewards and finds no room in the save to write that down (all MAX_FLAGS flags are taken,
 *     and the server's word is not in hand or the rewards could not all start or wait) is not closed yet: nothing of
 *     it is lost, and it closes, gifts and all, once a flag is used or the word is in hand. Goals collected meanwhile
 *     count for it.
 * @returns true when something in the save changed (the game then saves)
 */
export function seasonStep(company) {
  const item = itemDoing(company, 'season'), t = item ? seasonTime(company) : null;
  if (!item || !t) return false;
  const z = seasonSizes(item), store = company.store, now = seasonOf(t.now), p = store.pass;
  if (!now) return false;   // a clock that is no time at all: nothing turns
  // what closed months owe is settled first: a month the store's answer says was held is paid, and is never the one
  // dropped to make room for the month that closes now
  let changed = settleOwed(company, item, z);
  if (p && !SEASON.test(p.season)) { store.pass = { season: now, points: 0, claimed: [] }; changed = true; }   // not a month at all: a save nobody honest wrote
  else if (p && p.season > now && t.sure) { p.season = now; changed = true; }   // the device's clock was ahead when this season began: it is this month's
  // a month closes on the server's clock, or on the device's while that has not moved since the server's last answer:
  // a date set forward in airplane mode closes nothing (the Monthly card's rule, js/game/store.js, cardNow)
  else if (p && p.season < now && (t.sure || !t.moved)) {
    const step = Math.min(z.steps, Math.floor(num(p.points) / z.per)), had = collected(p, z.steps), gifts = step - had.free, owed = step - had.held;
    const name = 'owed' + p.season.replace('-', ''), flags = store.flags, owes = owed > 0 && z.rewards.length > 0, word = owes ? heldFor(company, item, p.season) : null;
    if (owes && word !== false && word !== FORGOTTEN && !flags[name]) {
      // a flag is written only while the word is not in hand: then, and only then, the oldest month owed may make room for it
      if (word == null) changed = dropOwed(company, MAX_OWED - 1) || changed;
      const ids = Array.from({ length: Math.min(owed, z.steps - had.held) }, (_, i) => z.rewards[(had.held + i) % z.rewards.length]);
      // what the close needs: a flag for what is owed, unless the word is in hand and every reward can start or wait now
      if (Object.keys(flags).length >= MAX_FLAGS && !(word === true && !handRoom(company, ids, company.wall()))) return changed;   // not closed yet: what it owes would be lost
    }
    changed = true;
    if (gifts > 0) {
      const cash = gifts * Math.floor(company.goalRef() * 60 * z.minutes);
      company.earn(cash);
      company.notice('Season', `The season of ${seasonName(p.season)} is over`, `${gifts === 1 ? 'A gift' : `${gifts} gifts`} you had not collected: +$${fmt(cash)}.`, 'goals');
    }
    store.pass = { season: now, points: 0, claimed: [] };
    if (owes && word === true) toldOwed(company, p.season, payOwed(company, z, name, had.held + 1, owed));   // the server's word is in hand: given now, as far as there is room
    else if (owes && word == null) flags[name] = { left: owed, value: had.held + 1 };
    else if (owes && word === FORGOTTEN) toldForgotten(company, p.season, Math.min(owed, z.steps - had.held));
  }
  return changed;
}
/** Settle what the closed months owe, as far as the store has said whether each month's pass was held (seasonStep). @returns true when the save changed */
function settleOwed(company, item, z) {
  const store = company.store;
  let changed = false;
  for (const name of owedFlags(company)) {
    const m = OWED.exec(name), season = `${m[1]}-${m[2]}`, held = heldFor(company, item, season);
    if (held == null) continue;   // the store has not answered: it waits
    const f = store.flags[name];
    if (held === FORGOTTEN) { delete store.flags[name]; changed = true; toldForgotten(company, season, Math.floor(num(f.left))); continue; }   // nobody can tell any more: dropped, and said
    if (held !== true || !z.rewards.length) { delete store.flags[name]; changed = true; continue; }   // no pass was held for that season: nothing was owed
    // from the step the flag names, as many as it says, as far as each can start or wait
    const gave = payOwed(company, z, name, Math.max(1, Math.floor(f.value)), Math.floor(f.left));
    if (gave.length || !store.flags[name]) changed = true;
    toldOwed(company, season, gave);
  }
  return changed;
}

/** A goal was collected: its points go to the season. @param period 'daily' | 'weekly' | anything else (no points) @returns the points added */
export function seasonPoints(company, period) {
  const item = itemDoing(company, 'season');
  if (!item) return 0;
  const z = seasonSizes(item), n = period === 'daily' ? z.daily : period === 'weekly' ? z.weekly : 0;
  if (!(n > 0) || !(z.steps > 0)) return 0;
  seasonStep(company);
  const store = company.store, t = seasonTime(company) || { now: company.wall() };
  if (!store.pass) {
    const season = seasonOf(t.now) || seasonOf(company.wall());
    if (!season) return 0;   // no clock that is a time: the goal is paid all the same, and its points are not counted
    store.pass = { season, points: 0, claimed: [] };
  }
  const before = Math.floor(num(store.pass.points));
  store.pass.points = Math.min(z.steps * z.per, before + n);
  return store.pass.points - before;
}

/**
 * Collect the next step: its cash gift, for everyone, and for a holder of the pass the next reward not collected, handed
 * out through its own effect (handOut). One step of each for one press, so that boosts are started when the player
 * means to start them. A holder's reward is given only while the server says, in this visit, that the pass of this
 * season is held; until then it stays to be collected.
 * @returns {{ step?: number, cash?: number, pass?: { step: number, item: any, done: any }, kept?: { step: number, item: any, why: string } }|null}
 *   null when nothing is to collect; kept: the holder's next reward could neither start nor wait, and was not collected
 */
export function seasonCollect(company) {
  seasonStep(company);
  const s = seasonState(company), p = company.store.pass;
  if (!s || !p) return null;
  let out = null;
  if (s.gifts > 0) {
    company.earn(s.gift);
    p.claimed.push(s.free + 1);
    out = { step: s.free + 1, cash: s.gift };
  }
  if (s.rewards > 0 && s.next) {
    // it can neither start nor wait: it is not collected, and stays to be collected; the answer says why
    const g = s.stuck ? null : handOut(company, s.next.id, company.wall());
    if (g && g.done.kind !== 'full') { p.claimed.push(101 + s.held); out = { ...(out || {}), pass: { step: s.held + 1, item: g.item, done: g.done } }; }
    else if (s.stuck || g) out = { ...(out || {}), kept: { step: s.held + 1, item: s.next, why: s.stuck || g.done.why } };
  }
  return out;
}

// --- receipts -----------------------------------------------------------------------------------------------------
/**
 * Apply every receipt that has not been applied, oldest first, and write each down in company.store.applied.
 * @param company   the Company (js/sim/company.js)
 * @param receipts  the server's list: [{ id, item, at }]
 * @param catalog   the store's items: [{ id, name, does, params }] (CREDITS.items of js/data/credits.js)
 * @param now       wall-clock milliseconds
 * @returns {{ receipt: any, item: any, done: any }[]}  what was done, for the game to show. Not in the list, and not written
 *   down: a receipt whose item this game does not know (it is tried again after an update, never dropped). In the list
 *   but not written down: done.kind 'wait' (it can do nothing now; tried again each time), 'world' (the game does it,
 *   then calls markApplied) and 'failed' (its effect threw: done.error says what; tried again each time, and the
 *   receipts after it are applied all the same).
 */
export function applyReceipts(company, receipts, catalog, now) {
  const store = company.store, out = [], seen = new Set(store.applied);
  const list = (Array.isArray(receipts) ? receipts : []).filter(r => r && typeof r.id === 'string' && ID.test(r.id) && typeof r.item === 'string')
    .sort((a, b) => rank(a.id) - rank(b.id));
  let boosted = false;
  for (const receipt of list) {
    if (seen.has(receipt.id)) continue;
    seen.add(receipt.id);   // the same receipt twice in one answer is one receipt
    // Older than everything a full list remembers: it could not be written down, and would be applied again every second.
    if (store.applied.length >= MAX_APPLIED && rank(receipt.id) < rank(store.applied[0])) continue;
    const item = catalog.find(i => i.id === receipt.item), effect = item ? EFFECTS[item.does] : null;
    if (!effect || typeof effect.apply !== 'function') continue;
    let done;
    try { done = effect.apply(company, item.params || {}, now); } catch (error) {
      out.push({ receipt, item, done: { kind: 'failed', error } });   // the failure is this receipt's: it is not written down, and the others go on
      continue;
    }
    if (!done) continue;
    if (done.kind !== 'wait' && done.kind !== 'world') markApplied(company, receipt.id);
    if (done.kind === 'boost') boosted = true;
    out.push({ receipt, item, done });
  }
  if (boosted) company.applyMods();   // a new boost counts from this moment
  return out;
}

/** The game's part of "Fill the machines": every input pad of these machines (js/sim/processor.js) is filled. @returns how many materials were added */
export function fillMachines(sims) {
  let added = 0;
  for (const s of sims) {
    const a = Math.max(0, s.inputCap - s.inputs);
    s.inputs += a; added += a;
    if (s.two) { const b = Math.max(0, s.inputCap - s.inputs2); s.inputs2 += b; added += b; }
  }
  return added;
}

/**
 * The Runner leaves a yard (the player walked on, or the item is no longer owned): what it carries is put back where
 * such goods come from, so nothing is lost and nothing is made. A finished good goes onto the output pad of a machine
 * that makes it, in the yard the Runner leaves if there is one, else in any open yard; a raw material goes back onto its
 * pile, which never runs out. The pad may then hold more than its limit: the machine waits until it is cleared.
 * @param carry  what the Runner holds: { type, count } (js/sim/economy.js, Carry); it is emptied
 * @param views  the station views of the open yards (Game.stationViews): { area, station: { sim, recipe } }
 * @param area   the id of the yard the Runner leaves
 * @returns how many goods went back onto a pad
 */
export function runnerReturn(carry, views, area) {
  const type = carry.type, count = carry.count;
  carry.type = null; carry.count = 0;
  if (!type || !(count > 0)) return 0;
  const makes = v => !!v.station?.sim && v.station.recipe?.output === type;
  const pad = views.find(v => v.area === area && makes(v)) || views.find(makes);
  if (!pad) return 0;
  pad.station.sim.outputs += count;
  return count;
}

/**
 * What an item would do if it were bought now, for the store's page: { usable: true, cash?, note?, fill? } (fill: how
 * full the piggy bank is, 0 to 1), or { usable: false, why } when it could do nothing (the page then does not sell it).
 * @param sims  the machines' rules, when the caller has them
 */
export function preview(company, item, now, sims = null) {
  const effect = item ? EFFECTS[item.does] : null;
  if (!effect || typeof effect.worth !== 'function') return { usable: true };
  const w = effect.worth(company, item.params || {}, now, sims);
  if (w.why) return { usable: false, why: w.why, ...(w.fill >= 0 ? { fill: Math.min(1, w.fill) } : {}) };   // a bank not sold now still shows how full it is
  return { usable: true, ...(w.cash > 0 ? { cash: w.cash } : {}), ...(w.note ? { note: w.note } : {}), ...(w.fill >= 0 ? { fill: Math.min(1, w.fill) } : {}) };
}

/**
 * What the credits store changes about a sale of the company, for the sale's own card, before the player confirms. A
 * sale cannot be undone, and what is owned is known only once the server has answered in this visit: so the card says
 * what will count, and what cannot be counted.
 * @param offer   Company.sellTerms()
 * @param family  'owned': the Family yard is owned; 'unknown': a player is signed in and the store's answer is not in hand, so nobody can tell; 'none'
 * @param yard    the first yard's name
 * @returns {{ text: string, warn: boolean }[]}
 */
export function saleLines(offer, family, yard) {
  const out = [];
  if (offer.stars > offer.plain) out.push({ text: `Your Star bonus counts for this sale: ${fmt(offer.stars)} stars, not ${fmt(offer.plain)}.`, warn: false });
  if (family === 'owned') {
    out.push({ text: offer.keeps > 0 ? `Your Family yard: the ${yard} keeps its ${offer.keeps} upgrade${offer.keeps === 1 ? '' : 's'}, with its workers and machines.`
      : `Your Family yard: the ${yard} has no upgrade to keep yet.`, warn: false });
  } else if (family === 'unknown') {
    // true for every way of not knowing (js/game/store.js, familyState): the first seconds of a visit, no connection, a session that ran out
    out.push({ text: `What you own in the store is not known right now. If you own the Family yard, it does not count now: a sale would start the ${yard} over with the others. To keep it, sell once the store has answered.`, warn: true });
  }
  return out;
}
/**
 * What a sale of the company does to the piggy bank, for the sale's card, below saleLines(): the bank holds hours of
 * the company's income, and a new company's bank is a small one. Nothing when the bank is empty and no purchase waits.
 * A purchase that waits for a full bank opens the new company's bank once that one is full: at once when the sale
 * leaves it full. The card says so, with what the player would have by waiting for their own bank to open first.
 * @param bank  Company.bankTerms(): { bank, after, waits?, full?, small? }
 * @returns {{ text: string, warn: boolean, amounts: number[] }[]}  amounts: the sums of money the text names, in its order
 */
export function bankLines(bank) {
  if (!bank) return [];
  const out = [];
  if (bank.bank >= 1) {
    out.push(bank.after < bank.bank
      ? { text: `Your piggy bank holds $${fmt(bank.bank)}. A new company's bank is smaller: after the sale it holds $${fmt(bank.after)}.`, warn: false, amounts: [bank.bank, bank.after] }
      : { text: `Your piggy bank keeps its $${fmt(bank.bank)} through the sale.`, warn: false, amounts: [bank.bank] });
  }
  if (bank.waits && bank.small >= 1 && bank.full > bank.small) {   // a sale changes what the purchase pays
    const now = bank.after >= bank.small, ends = `your bank now opens for it at $${fmt(bank.full)}. To have that, sell after it has opened.`;
    out.push(now ? { text: `A purchase waits for your piggy bank to fill. Right after the sale it opens the new company's bank and pays $${fmt(bank.small)}; ${ends}`, warn: true, amounts: [bank.small, bank.full] }
      : { text: `A purchase waits for your piggy bank to fill. After the sale it opens when the new company's bank is full, at $${fmt(bank.small)}; ${ends}`, warn: true, amounts: [bank.small, bank.full] });
  }
  return out;
}

/**
 * An item's name as one thing, for a sentence that names several or puts an article before it: "Double income, 1
 * hour" reads as a list ("Collect $309K and a Double income, 1 hour"), "Double income (1 hour)" does not. The Goals tab
 * and the store's lines name the items the game hands out this way.
 */
export const itemTitle = item => (item?.name?.includes(', ') ? item.name.replace(', ', ' (') + ')' : item?.name || '');
/** The closed months whose Season pass rewards wait for the server's word (`owed<YYYYMM>`), oldest first: [{ season, name, left }]. */
export function seasonOwed(company) {
  return owedFlags(company).map(n => { const m = OWED.exec(n), season = `${m[1]}-${m[2]}`; return { season, name: seasonName(season), left: Math.floor(num(company.store.flags[n].left)) }; });
}

/** One line about what a receipt did, for the game to show. */
export function receiptLine(item, done) {
  switch (done.kind) {
    case 'cash': return `${item.name}: +$${fmt(done.cash)}`;
    case 'boost': return `${item.name}: running for ${fmt(done.minutes)} min`;
    case 'flag': return `${item.name}: ready` + (done.left > 1 ? `, ${done.left} waiting` : '');
    case 'stage': return `${item.name}: ${fmt(done.goods)} goods sent to the site`;
    case 'sold': return `${item.name}: +$${fmt(done.cash)} for ${fmt(done.goods)} goods`;
    case 'filled': return `${item.name}: ${fmt(done.goods)} materials put on the pads`;
    case 'gate': return `${done.name} is open: $${fmt(done.cash)} paid`;   // short: a yard's name is long, and other purchases may be said with it
    case 'offers': return `${item.name}: ${done.offers} new offer${done.offers === 1 ? '' : 's'} on the board`;
    case 'goals': return `${item.name}: ${done.goals} goal${done.goals === 1 ? '' : 's'} drawn again`;
    case 'ticket': return `${item.name}: choose its event on the store's page`;
    case 'bank': return `${item.name}: empty now. Your purchase opens it when it is full`;
    case 'wait': return `${item.name} is kept for later. ${done.why}`;
    case 'full': return `${item.name} was not given. ${done.why}`;
    default: return item.name;
  }
}

// --- modifiers and boosts -------------------------------------------------------------------------------------------
/**
 * Fold what is owned for good and what is running into the company's modifiers. Called from Company.applyMods(), after
 * research and before the event. A stat the modifiers do not have is ignored.
 * @param mods     the modifiers being built: { price, speed, workerSpeed, ..., capacity, crew }
 * @param owns     (itemId) => boolean, true only while the server has said so in this visit
 * @param catalog  the store's items
 * @param levelOf  (itemId) => the level owned of an item with levels, from 1 (the server's count in this visit); left out, every helper is at its first level
 * @returns mods, with `timed` ({ stat: factor } of the running boosts alone) and `timedUntil` (when the next one ends, or Infinity)
 */
export function storeMods(mods, company, owns, now, catalog, levelOf = id => 1) {
  for (const item of catalog) {
    if (!owns(item.id)) continue;
    const p = item.params || {};
    if (item.does === 'advisor_pro') { if (Object.hasOwn(mods, 'advisorPro')) mods.advisorPro = true; continue; }
    if (item.does === 'helper') {   // the size of the level owned; a level the catalog does not have counts as its last
      const value = helperValue(item, levelOf(item.id));
      if (typeof p.stat === 'string' && typeof mods[p.stat] === 'number' && Object.hasOwn(mods, p.stat) && value > 0) mods[p.stat] = value;
      continue;
    }
    if (item.does !== 'perm') continue;
    const value = Number(p.value);
    if (typeof p.stat !== 'string' || !Object.hasOwn(mods, p.stat) || !Number.isFinite(value) || !(value > 0)) continue;
    if (p.op === 'mult' && typeof mods[p.stat] === 'number') mods[p.stat] *= value;
    else if (p.op === 'add' && typeof mods[p.stat] === 'number') mods[p.stat] += value;
    else if (p.op === 'set' && (typeof mods[p.stat] === 'number' || mods[p.stat] === null)) mods[p.stat] = Math.max(Number(mods[p.stat]) || 0, value);
  }
  const timed = {};
  let next = Infinity;
  for (const b of company.store.boosts) {
    if (!(b.until > now)) continue;
    next = Math.min(next, b.until);   // also for an event a ticket started (a boost under the event's name): the Company folds its effect, and must fold again when it ends
    if (typeof mods[b.stat] !== 'number') continue;
    mods[b.stat] *= b.value;
    timed[b.stat] = (timed[b.stat] || 1) * b.value;
  }
  mods.timed = timed; mods.timedUntil = next;
  return mods;
}

/** How many levels a helper has: the length of its "levels"; 0 for anything else. */
export const helperLevels = item => (item?.does === 'helper' && Array.isArray(item.params?.levels) ? item.params.levels.length : 0);
/** The size of a helper at `level` (from 1; past the last level, the last): a number above 0, or 0 when the item has none. */
export function helperValue(item, level) {
  const n = helperLevels(item);
  if (!n) return 0;
  return num(item.params.levels[Math.min(n, Math.max(1, Math.floor(Number(level)) || 1)) - 1]);
}
/**
 * A helper's levels in words, for the store's page: { now, next }, each a phrase like "one batch every 20 seconds" or
 * null (now: nothing is owned yet; next: the last level is owned, or the helper has nothing to tell).
 * @param level  the level owned, 0 for none
 */
export function helperText(item, level) {
  const say = HELPER_WORDS[item?.params?.stat], n = helperLevels(item);
  if (!say || !n) return { now: null, next: null };
  return { now: level >= 1 ? say(helperValue(item, level)) : null, next: level < n ? say(helperValue(item, level + 1)) : null };
}

/**
 * Once in a while: forget the boosts that have ended, and open a full piggy bank for a purchase that waited for it.
 * @returns true when a boost ran out since the modifiers were folded (the company then folds them again)
 */
export function tickStore(company, now) {
  const store = company.store;
  if (store.boosts.some(b => !(b.until > now))) store.boosts = store.boosts.filter(b => b.until > now);
  const opened = bankDue(company);   // a purchase of the piggy bank that waited for a full one
  if (opened?.gone) company.notice('Credits', 'Your piggy bank is open', `The piggy bank is no longer sold. The purchase that waited for it paid what it held: $${fmt(opened.cash)}.`, 'gem');
  else if (opened) company.notice('Credits', 'Your piggy bank is full, and open', `The purchase that waited for it paid $${fmt(opened.cash)}. It fills again as you sell.`, 'gem');
  return now >= (company.mods?.timedUntil ?? Infinity);
}

/** The running boosts, for the chips of the top bar: [{ key, label, seconds }]. An event a ticket started is a chip with the event's name. */
export function boostChips(company, now) {
  const named = stat => (typeof company.boostName === 'function' ? company.boostName(stat) : null);
  return company.store.boosts.filter(b => b.until > now)
    .map(b => ({ key: `${b.stat}:${b.value}`, label: named(b.stat) || `×${b.value} ${WORDS[b.stat] || b.stat}`, seconds: Math.ceil((b.until - now) / 1000) }));
}

/**
 * Start an event for a ticket: a boost under the event's name, running until `until`. It multiplies nothing itself.
 * @returns false when no more boosts can run (the ticket is then not used)
 */
export function startEvent(company, id, until) {
  const boosts = company.store.boosts, stat = 'event' + id;
  if (!NAME.test(stat) || boosts.length >= MAX_BOOSTS) return false;
  boosts.push({ stat, value: 1, until: Math.floor(until) });
  return true;
}

/**
 * What the running timed boosts multiply income by right now: the price boosts alone, multiplied. A price multiplies
 * every sale, so dividing by it is exact. A Machine rush or a Worker rush does not multiply income by its factor (a
 * yard's flow is held back by its other steps), so it is not divided out: see calmStep. Never below 1.
 * @param mods the company's modifiers, with `timed` as storeMods leaves it
 */
export function timedFactor(mods) {
  return Math.max(1, num(mods?.timed?.price) || 1);
}

/** True while a timed Machine rush or Worker rush runs. @param mods the company's modifiers, with `timed` as storeMods leaves it */
export function rushing(mods) {
  const t = mods?.timed || {};
  return num(t.speed) > 0 || num(t.workerSpeed) > 0;
}

/**
 * What the workers bring in a second without the timed boosts: the rate that time away and a time skip are paid by.
 * A boost ends by the clock, but an absence paid at the boosted rate would carry it on for hours.
 * @param rate    what the income meter measured
 * @param carried how much of the timed price boosts that measurement carries (a number of at least 1; anything else counts as 1)
 */
export function awayRate(rate, carried) {
  const r = Number(rate), c = Number(carried);
  if (!Number.isFinite(r) || !(r > 0)) return 0;
  return r / (Number.isFinite(c) && c >= 1 ? c : 1);
}

/** Seconds of game time a rush stays in the income meter's memory: four of its 45 seconds (js/sim/offline.js, RateMeter). */
export const CALM_MEMORY = 180;

/**
 * One step of the calm rate, the rate without boosts that a save and a time skip use. While a rush runs, and for
 * CALM_MEMORY seconds after it, the meter's rate holds an unknown share of the rush: the calm rate is then the last
 * one measured without a rush. Otherwise it is awayRate(rate, carried), exact for price boosts. Stepped by the game
 * loop right after the two meters tick, only while the game runs.
 * @param {{ rate: number, rest: number }} calm  the rate, and the seconds of the rush's memory still to run out
 * @param mods     the company's modifiers, with `timed`
 * @param rate     the income meter's rate
 * @param carried  the second meter's rate: how much of the price boosts the income meter carries
 * @param dt       the step, in seconds of game time
 * @returns calm
 */
export function calmStep(calm, mods, rate, carried, dt) {
  if (rushing(mods)) calm.rest = CALM_MEMORY;
  else calm.rest = Math.max(0, calm.rest - dt);
  if (calm.rest <= 0) calm.rate = awayRate(rate, carried);
  return calm;
}


// --- flags: bought once, used once -----------------------------------------------------------------------------------
/** What a waiting flag is worth, without using it: its value, or 1 when none waits. */
export function flagValue(company, name) { const f = company.store.flags[name]; return f && f.left > 0 ? f.value : 1; }
/** Use a flag once. @returns its value, or 1 when none waited */
export function useFlag(company, name) {
  const f = company.store.flags[name];
  if (!f || !(f.left > 0)) return 1;
  if (--f.left <= 0) delete company.store.flags[name];
  return f.value;
}
/** The pay for time away with a Double welcome-back, if one waits. It is used only when something is paid. @returns {{ earned: number, times: number }} */
export function awayPay(company, earned) {
  if (!(earned >= 1)) return { earned: 0, times: 1 };
  const times = useFlag(company, 'awayX2');
  return { earned: Math.floor(earned * times), times };
}
