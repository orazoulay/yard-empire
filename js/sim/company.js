// Pure company rules: finances, contracts and the warehouse, research, truck routes, the market, milestones and ranks.
// No rendering and no browser APIs here. The game (main.js) and the simulators (tools/) both drive this class,
// so what is tested and simulated is what runs.
//
// The company sits beside the Economy: it reads cash, upgrades and open yards from it, changes cash only
// through addCash / spend, and is saved inside the Economy's save as `company`.
import { FINANCE, RANKS, MILESTONES, WAREHOUSE, CONTRACTS, ROUTES, RESEARCH, TABS, STAFF, STAFF_RULES, GOALS, ACHIEVEMENTS, PRESTIGE, EVENTS, EVENT_GOAL, LOCATIONS, RUSH, CLIENTS, STREAK, MARKET } from '../data/company.js';
import { BUILDS, SITE } from '../data/builds.js';
import { RateMeter, OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY } from './offline.js';
import { Market } from './market.js';
import { CREDITS } from '../data/credits.js';
import { UNCHECKED } from './sync.js';
import { MAX_FLAGS, MAX_BOOSTS, seasonState, loadStore, storeJSON, storeMods, tickStore, useFlag, flagValue, itemDoing, bankAdd, bankCap, bankNow, seasonStep, seasonPoints, startEvent } from './store.js';
import { fmt } from '../format.js';

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const BOOK_KEYS = ['sales', 'supplied', 'stocked', 'site', 'materials'];   // site: goods given to the building site, at the normal price
const PERIODS = ['daily', 'weekly', 'event'];   // the lists of goals a player can collect from
// The last five came with the records: market goods sold, how many of them from the warehouse at a good and at a top price, rush orders made and missed.
const STAT_KEYS = ['income', 'costs', 'contracts', 'trucked', 'sold', 'byHand', 'projects', 'bestContract', 'dailySets', 'autoDelivered',
  'marketSold', 'marketGood', 'marketTop', 'rush', 'rushLate'];
const SLOW_TICK = 0.5;   // seconds between the cheap housekeeping passes
const CLIENT_NAMES = new Set(CONTRACTS.kinds.flatMap(k => k.clients));   // the only names the client book keeps, so it cannot grow
const CLIENT_MAX = 9999;
const EPS = 1e-9;        // prices are compared with a hair of tolerance: 1.1 times normal must count as 10% above
const cap = text => text[0].toUpperCase() + text.slice(1);

export const NAME_MAX = 24;
/**
 * A company name as it may be saved and shown: letters and digits of any alphabet, spaces and & ' . , -
 * and nothing else, at most NAME_MAX characters. The server cleans names the same way (backend/api.py).
 */
export function cleanName(text) {
  if (typeof text !== 'string') return '';
  return text.normalize('NFC').replace(/[^\p{L}\p{N} &'.,-]/gu, '').replace(/ +/g, ' ').trim().slice(0, NAME_MAX).trim();
}
/** "45 s", "4 min", "1 min 30 s": a stretch of play time in words. */
export function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s} s`;
  return s % 60 && s < 120 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.ceil(s / 60)} min`;
}

/** A repeatable pseudo-random number in [0, 1) for a whole-number seed (mulberry32). */
function rand(seed) {
  let t = (seed + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Dollars per second a fully built yard adds, by yard index: what wages and upkeep are a share of. */
export const refIncome = i => (i <= 0 ? FINANCE.baseIncome : FINANCE.baseIncome * Math.pow(FINANCE.growth, i) * (1 - 1 / FINANCE.growth));
export const rankOf = xp => RANKS.reduce((best, r, i) => (xp >= r.xp ? i : best), 0);
/**
 * The kind of a contract. For a rush order the name says how it stands, because the time is what the order
 * is about: "Rush order · 6 min" as an offer, "Rush order · 4 min left" while it runs, "in time" once the goods are there.
 */
export const kindOf = contract => {
  const kind = CONTRACTS.kinds.find(k => k.id === contract.kind) || CONTRACTS.kinds[0];
  if (!kind.rush || !contract.limit) return kind;
  const state = contract.safe ? 'in time' : contract.left != null ? clockText(contract.left) + ' left' : clockText(contract.limit);
  return { ...kind, name: `${kind.name} · ${state}` };
};

/**
 * The building site as a save has it, kept to what the builds allow: builds are finished in order, only the next one
 * can be running, and a stage holds no more of a good than it needs. A stage that a save claims to be full is left
 * one good short, so that loading a game never finishes anything or pays anything.
 */
function readSite(raw) {
  const site = { done: [], at: null, stage: 0, given: {}, value: 0, on: true };
  if (!raw || typeof raw !== 'object') return site;
  const done = new Set(Array.isArray(raw.done) ? raw.done : []);
  for (const b of BUILDS) { if (!done.has(b.id)) break; site.done.push(b.id); }
  const next = BUILDS[site.done.length];
  if (next && raw.at === next.id) {
    site.at = next.id;
    site.stage = Math.min(next.stages.length - 1, Math.max(0, Math.floor(num(raw.stage))));
    const needs = next.stages[site.stage].needs;
    for (const [item, need] of needs) { const n = Math.min(need, Math.floor(num(raw.given?.[item]))); if (n > 0) site.given[item] = n; }
    if (needs.every(([item, need]) => site.given[item] === need)) site.given[needs[0][0]] = needs[0][1] - 1;
    site.value = Math.max(0, num(raw.value));
  }
  site.on = raw.on !== false;
  return site;
}

export class Company {
  /**
   * @param world { econ, areas, items, recipes }  the Economy and the game data
   * @param saved the `company` part of a save, or null for a new game or a save from before the company
   */
  constructor({ econ, areas, items, recipes }, saved = null) {
    this.econ = econ; this.areas = areas; this.items = items; this.recipes = recipes;
    this.index = new Map(areas.map((a, i) => [a.id, i]));

    // Which recipe a yard runs, and which yard makes each item: both read from the yard data.
    this.yardRecipe = {}; this.maker = {};
    for (const a of areas) {
      const st = [...a.stations, ...a.upgrades.filter(u => u.effect.type === 'station').map(u => u.effect.station)].find(s => s.type === 'processor');
      this.yardRecipe[a.id] = st ? st.recipe : null;
      const r = st && recipes[st.recipe];
      if (r && !(r.output in this.maker)) this.maker[r.output] = a.id;
    }
    // Goods that reach a shop in a finished company, which is where the building site takes them: every product
    // no machine uses, and the few of which a surplus is made (js/data/builds.js).
    const used = new Set(Object.values(recipes).flatMap(r => [r.input, r.input2]).filter(Boolean));
    this.siteGoods = new Set([...Object.values(recipes).map(r => r.output).filter(item => !used.has(item)), ...SITE.surplus]);
    // Goods made in a location with a market are traded there: what they sell for moves (js/sim/market.js).
    const trading = new Set(LOCATIONS.filter(l => l.market).map(l => l.id));
    this.marketYards = areas.filter(a => trading.has(a.location)).map(a => a.id);
    const marketGoods = this.marketYards.map(id => recipes[this.yardRecipe[id]]?.output).filter(Boolean);
    this.metroYards = areas.filter(a => a.location === 'metropolis').map(a => a.id);   // the ninth rank asks for these, fully built
    // A truck route exists wherever one yard's product is another yard's input.
    this.routeDefs = [];
    for (const a of areas) {
      const r = recipes[this.yardRecipe[a.id]];
      for (const item of r ? [r.input, r.input2] : []) {   // one route per material that another yard makes
        const from = item && this.maker[item];
        if (!from || from === a.id) continue;
        const hire = a.upgrades.find(u => u.effect.type === 'worker');
        this.routeDefs.push({ id: from + '>' + a.id, from, to: a.id, item, cost: (hire ? hire.cost : 0) * ROUTES.costMult });
      }
    }

    const s = saved && typeof saved === 'object' ? saved : null;
    this.founded = !!s?.founded;
    this.xp = num(s?.xp);
    this.done = { ...(s?.done || {}) };            // milestone id -> true
    this.research = { ...(s?.research || {}) };    // technology id -> level
    this.routes = { ...(s?.routes || {}) };        // route id -> true
    this.stock = { ...(s?.stock || {}) };          // warehouse: item -> count
    const contracts = (list, running) => (Array.isArray(list) ? list : []).filter(c => c && Array.isArray(c.needs)).map(c => {
      const out = { id: c.id, kind: c.kind, client: c.client, needs: c.needs.map(n => [n[0], num(n[1])]) };
      // a rush order carries its time limit, and what is left of it once it runs
      if (c.kind === 'rush') { out.limit = num(c.limit) || RUSH.minLimit; if (running) out.left = c.left == null ? out.limit : num(c.left); }
      return out;
    });
    this.offers = contracts(s?.offers, false);
    this.active = contracts(s?.active, true);
    this.rushIn = s && s.rushIn != null ? num(s.rushIn) : RUSH.first;   // play seconds until the next rush order may be offered
    this.seq = num(s?.seq);                        // how many offers were ever made: the seed of the next one
    this.refreshIn = num(s?.refreshIn);            // play seconds until "new offers" is available again
    this.rep = num(s?.rep);
    this.spent = num(s?.spent);                    // paid into research and routes
    this.stats = {};                               // lifetime counters
    for (const k of STAT_KEYS) this.stats[k] = num(s?.stats?.[k]);
    this.team = { ...(s?.team || {}) };            // manager id -> level (1 = hired)
    // the Factory Manager's switch (on unless switched off) and the Sales Manager's (off unless switched on)
    this.settings = { autoBuy: s?.settings?.autoBuy !== false, autoSell: s?.settings?.autoSell === true };
    this.badges = { ...(s?.badges || {}) };        // achievement id -> true
    const goals = list => (Array.isArray(list) ? list : []).filter(g => g && GOALS.kinds.some(k => k.id === g.kind))
      .map(g => ({ kind: g.kind, target: num(g.target), base: num(g.base), cash: num(g.cash), xp: num(g.xp), claimed: !!g.claimed, told: !!g.told }));
    this.goals = { day: num(s?.goals?.day), week: num(s?.goals?.week), daily: goals(s?.goals?.daily), weekly: goals(s?.goals?.weekly), bonus: !!s?.goals?.bonus, bonusCash: num(s?.goals?.bonusCash),
      event: goals(s?.goals?.event), eventId: typeof s?.goals?.eventId === 'string' ? s.goals.eventId : '',
      swapDay: num(s?.goals?.swapDay) };   // the day a daily goal was last exchanged: once a day
    this.legacy = { stars: num(s?.legacy?.stars), sales: num(s?.legacy?.sales) };   // from selling the company: kept for good
    this.away = { day: num(s?.away?.day), used: num(s?.away?.used) };               // seconds of today's time-away allowance already paid
    this.market = new Market(marketGoods, s?.market);                               // seed, clock and held goods; absent in older saves
    // Records: what the company keeps count of for good. `partial` marks a game that was already running when
    // records were added, whose time played and goods are therefore counted from that day only.
    this.records = { goods: {}, peakMinute: num(s?.records?.peakMinute), played: num(s?.records?.played),
      partial: s ? (s.records ? !!s.records.partial : !!s.founded || num(s.stats?.sold) > 0) : Object.keys(econ.unlocked).length > 0 };
    for (const [item, n] of Object.entries(s?.records?.goods || {})) if (items[item] && num(n) > 0) this.records.goods[item] = num(n);
    this.minute = { t: 0, sum: 0 };                                                 // the minute of play being counted for "most earned in one minute"
    this.streak = { day: num(s?.streak?.day), count: Math.min(STREAK.cap, Math.floor(num(s?.streak?.count))), best: Math.min(STREAK.cap, Math.floor(num(s?.streak?.best))) };
    this.clients = {};                                                              // client name -> orders delivered to it
    for (const [name, n] of Object.entries(s?.clients || {})) if (CLIENT_NAMES.has(name) && num(n) > 0) this.clients[name] = Math.min(CLIENT_MAX, Math.floor(num(n)));
    this.name = cleanName(s?.name);                                                 // the company's name, '' until the player chooses one
    // Things that happen once: the three first-time hints, and the Metropolis fully built (the ninth rank asks for it).
    // A game saved before the hints existed is not told about a market it has traded on, or a sale it has made.
    this.seen = { market: s?.seen ? !!s.seen.market : this.market.t > 300, sale: s?.seen ? !!s.seen.sale : this.legacy.sales > 0,
      rush: !!s?.seen?.rush, metropolis: !!s?.seen?.metropolis, site: !!s?.seen?.site };
    this.site = readSite(s?.site);                                                  // the building site (js/data/builds.js); absent in older saves
    // The credits store (js/sim/store.js): the receipts already applied, the boosts that run and the flags that wait.
    // Absent in older saves, and written only once something was bought. What is owned for good is not in the save:
    // the server says so in each visit, and the game hands its answer over with setOwns().
    this.store = loadStore(s?.store);
    // Where the block came from: 'save' (the save had one), 'unchecked' (one a visit started without the server's word,
    // js/sim/sync.js, UNCHECKED: the flag is the save's word, not one of the block's flags) or 'none'. The game decides
    // from it whether the block is known (js/game/store.js); while it is not, `storeUnsure` is set and the flag written.
    this.storeFrom = !s?.store || typeof s.store !== 'object' || Array.isArray(s.store) ? 'none' : this.store.flags[UNCHECKED] ? 'unchecked' : 'save';
    delete this.store.flags[UNCHECKED];
    this.storeUnsure = false;
    this.owns = () => false;                                                        // (itemId) => boolean: nothing is owned until the server has said so
    this.storeLevel = () => 1;                                                      // (itemId) => the level owned of a helper with levels, from 1 (not `level`: that is research)
    this.catalog = CREDITS.items;                                                   // what the store's items do; a test may put its own list here
    this.wall = () => Date.now();                                                   // the wall clock in milliseconds: a boost ends by it, game open or not
    this.heldSeason = () => null;                                                   // (itemId, 'YYYY-MM') => was the Season pass held for that month: true, false, null when nobody can tell yet (until the game says, setSeason), or 'forgotten' when nobody can tell any more
    this.seasonTime = () => ({ now: this.wall(), sure: false });                    // the season's clock: { now, sure } (sure: it is the server's), or null while its answer is on its way
    this.siteTurn = false;                                                          // a good a contract and the site both need: whose turn it was
    this.marketStep = null;                                                         // the price step the alerts were last checked at
    this.books = new Map();                        // yard id -> smoothed dollars per second, by BOOK_KEYS
    const meter = () => new RateMeter(0, FINANCE.rateMemory);
    this.flow = { income: meter(), costs: meter(), transport: meter() };
    this.trips = new Map();                        // route id -> items per second
    this.shopFlow = new Map();                     // item -> items per second reaching the shops
    this.settling = s ? CONTRACTS.staleSeconds : 0;   // play seconds a loaded game still waits with new offers, while nothing is measured (orderable)
    this.acc = {};                                 // route id -> part of the next item
    this.events = [];                              // for the game to celebrate: founded, milestone, rank, ready
    this.readyIds = new Set();
    this.clock = 0;
    this.age = 0;                                  // seconds of play since this game was loaded
    this.staleIn = CONTRACTS.staleSeconds * 2;     // let the flow figures settle after loading
    this.applyMods();

    // A save from before the company has earned at least what it spent: credit that, and count the
    // milestones it already meets without a celebration for each.
    if (!s) this.stats.income = econ.cash + Object.values(econ.paid).reduce((a, b) => a + num(b), 0);
    this.costTable = []; this.costPerSec = 0; this.salaryPerSec = 0;
    this.sync(true);
    this.refreshCosts();
    for (const c of this.active) if (this.ready(c)) this.readyIds.add(c.id);
  }

  toJSON() {
    return {
      v: 1, founded: this.founded, xp: Math.round(this.xp), done: this.done, research: this.research, routes: this.routes,
      stock: this.stock, offers: this.offers, seq: this.seq, refreshIn: Math.round(this.refreshIn),
      active: this.active.map(({ safe, ...c }) => (c.left == null ? c : { ...c, left: Math.round(c.left) })),   // a rush order's time in whole seconds, without what is worked out again on loading
      rep: this.rep, spent: Math.round(this.spent),
      stats: Object.fromEntries(STAT_KEYS.map(k => [k, Math.round(this.stats[k])])),
      team: this.team, settings: this.settings, badges: this.badges, goals: this.goals,
      legacy: this.legacy, away: { day: this.away.day, used: Math.round(this.away.used) },
      ...(this.market.open ? { market: this.market.toJSON() } : {}),   // only once the market has opened: older saves stay as they were
      records: { goods: this.records.goods, peakMinute: Math.round(this.records.peakMinute), played: Math.round(this.records.played), partial: this.records.partial },
      streak: this.streak, clients: this.clients, seen: this.seen, rushIn: Math.round(this.rushIn),
      ...(this.name ? { name: this.name } : {}),
      // the building site, only once something was built or started: older saves, and those of players who never get there, stay as they were
      ...(this.site.at || this.site.done.length ? { site: { done: this.site.done, at: this.site.at, stage: this.site.stage, given: this.site.given, value: Math.round(this.site.value), on: this.site.on } } : {}),
      // the credits store, only once something was bought: a save from before it is written back as it was
      ...(storeJSON(this.store) ? { store: this.storeBlock() } : {}),
    };
  }
  /**
   * The store block as it is saved: storeJSON(), and while the block was started without the server's word
   * (`storeUnsure`) with the flag that says so (js/sim/sync.js, UNCHECKED), while there is room for it.
   */
  storeBlock() {
    const block = storeJSON(this.store);
    if (!block || !this.storeUnsure || Object.keys(block.flags).length >= MAX_FLAGS) return block;
    return { ...block, flags: { ...block.flags, [UNCHECKED]: { left: 1, value: 1 } } };
  }
  /**
   * The store block the server keeps, taken over in the middle of a visit whose save could not be pulled as it began
   * (js/game/store.js): it replaces the block the visit started from nothing, and the rest of the progress stays.
   */
  adoptStore(block) {
    this.store = loadStore(block, this.wall());
    delete this.store.flags[UNCHECKED];
    this.storeUnsure = false;
    this.applyMods();   // its running boosts count from this moment
  }
  /** Something to tell the player once, as a card: the game shows it like its other announcements. symbol: an icon of js/icons.js. */
  notice(kicker, title, desc, symbol) { this.events.push({ type: 'notice', card: { kicker, title, desc, symbol } }); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  // --- research modifiers ---------------------------------------------------
  level(id) { return this.research[id] || 0; }
  /** Fold every researched effect into plain numbers, and hand price and speed to the Economy. */
  applyMods() {
    const m = { price: 1, speed: 1, workerSpeed: 1, wage: 1, upkeep: 1, storage: 1, routeRate: 1, contractPay: 1, contractSlots: 0, offlineShare: null, offlineCap: null, routes: false,
      autoDeliver: false, autoAccept: false, autoBuy: false, researchCost: 1, truckFee: 1, clientBonus: 1, forecast: false,
      capacity: 1, crew: 0,     // these two are the store's: what the player carries, and extra workers in every yard
      dailyGoals: 0, familyYard: 0,   // and these: daily goals beyond the usual three, and (above 0) the first yard kept through a sale
      // the store's helpers (js/sim/store.js, EFFECTS.helper): no wait at a pad, how much an output pad holds, what the Runner
      // carries (0: there is none), the seconds of a Night Watch batch (0: none), the factor on the pay for time away, the Advisor Pro
      noWait: 0, outputCap: 1, runner: 0, nightWatch: 0, awayPay: 1, advisorPro: false };
    const apply = e => {
      if (e.type === 'mult') m[e.stat] *= e.value;
      else if (e.type === 'add') m[e.stat] += e.value;
      else if (e.type === 'set') Object.assign(m, e.values);
    };
    for (const st of STAFF) for (let i = 0; i < (this.team[st.id] || 0); i++) apply(st.effects[i]);   // a manager: one effect per level
    for (const r of RESEARCH) {
      const level = this.level(r.id), e = r.effect;
      if (!level) continue;
      if (e.type === 'mult') m[e.stat] *= Math.pow(e.value, level);
      else if (e.type === 'add') m[e.stat] += e.value * level;
      else if (e.type === 'set') Object.assign(m, e.values);
    }
    m.price *= 1 + PRESTIGE.starBonus * this.legacy.stars;   // legacy stars from companies sold
    storeMods(m, this, this.owns, this.wall(), this.catalog, this.storeLevel);   // the credits store: what is owned for good, at its level, and the boosts that run
    for (const event of this.eventsNow()) apply(event.effect);   // today's event, and those an Event ticket of the credits store started
    this.mods = m;
    this.econ.boost = { price: m.price, speed: m.speed, capacity: m.capacity };
  }
  /**
   * Who says what is owned in the credits store: (itemId) => boolean, the server's answer in this visit. Anything else: nothing is owned.
   * @param levelFn  (itemId) => the level owned of an item with levels, from 1; left out, every helper is at its first level
   */
  setOwns(fn, levelFn) {
    this.owns = typeof fn === 'function' ? fn : () => false;
    this.storeLevel = typeof levelFn === 'function' ? levelFn : () => 1;
    this.applyMods();
  }

  /**
   * Who says what only the server knows about the season (js/sim/store.js): whether the Season pass was held for a
   * month, and what time it is. @param heldFn  (itemId, 'YYYY-MM') => true | false | null (the store has not answered in this visit)
   * @param timeFn  () => { now, sure, moved? } (sure: the server's clock; moved: the device's date moved since the server's last answer, so no month closes on it), or null while the server's answer is on its way
   */
  setSeason(heldFn, timeFn) {
    this.heldSeason = typeof heldFn === 'function' ? heldFn : () => null;
    this.seasonTime = typeof timeFn === 'function' ? timeFn : () => ({ now: this.wall(), sure: false });
  }

  // --- progress ---------------------------------------------------------------
  /** The rank: the last one whose experience is reached and whose condition, if it has one, was met. A rank is never lost. */
  get rank() {
    let i = rankOf(this.xp);
    while (i > 0 && RANKS[i].needs && !this.seen[RANKS[i].needs]) i--;
    return i;
  }
  rankInfo() {
    const i = this.rank, cur = RANKS[i];
    let next = RANKS[i + 1] || null;
    // The experience may be there before the condition is: the bar is then full, and the name of the next rank says what is missing.
    if (next?.needs && !this.seen[next.needs]) next = { ...next, name: `${next.name}, ${next.needsText}` };
    return { index: i, name: cur.name, icon: cur.icon, xp: this.xp, next, progress: next ? Math.min(1, (this.xp - cur.xp) / (next.xp - cur.xp)) : 1 };
  }
  measure(name) {
    switch (name) {
      case 'yards': return this.econ.areas.length;
      case 'workers': return this.staff().workers;
      case 'income': return this.stats.income;
      case 'contracts': return this.stats.contracts;
      case 'research': return Object.values(this.research).reduce((a, b) => a + b, 0);
      case 'routes': return Object.keys(this.routes).length;
      case 'market': return this.stats.marketSold;
      case 'goodPrice': return this.stats.marketGood;
      case 'sold': return this.stats.sold;
      case 'peak': return this.records.peakMinute;
      case 'rush': return this.stats.rush;
      default: return 0;
    }
  }
  /** Founding, milestones and offers follow the state of the game. `silent` skips the celebrations. */
  sync(silent = false) {
    if (!this.founded && this.econ.areas.length >= FINANCE.foundingYards) { this.founded = true; this.refreshCosts(); this.events.push({ type: 'founded' }); }
    if (!this.founded) return;
    // The market opens with the first yard of its location. Its seed comes from the company's own books
    // at that moment, so two companies do not see the same prices and nothing is rolled at random.
    if (!this.market.open && this.marketOpen()) this.market.start(this.stats.income + this.stats.sold * 7919 + this.xp);
    const before = this.rank;
    if (!this.seen.metropolis && this.metroYards.length && this.built(this.metroYards) === this.metroYards.length) this.seen.metropolis = true;
    for (const m of MILESTONES) {
      if (this.done[m.id] || this.measure(m.measure) < m.at) continue;
      this.done[m.id] = true; this.xp += m.xp;
      if (!silent) this.events.push({ type: 'milestone', milestone: m });
    }
    for (const a of ACHIEVEMENTS) {
      if (this.badges[a.id] || this.achieved(a.measure) < a.at) continue;
      this.badges[a.id] = true; this.xp += a.xp;
      if (!silent) this.events.push({ type: 'achievement', achievement: a });
    }
    for (const period of PERIODS) {
      for (const g of this.goalList(period)) {
        if (!g.done || this.goals[period][g.index].told) continue;
        this.goals[period][g.index].told = true;
        if (!silent) this.events.push({ type: 'goal', period, goal: g });
      }
    }
    if (!silent && this.rank > before) this.events.push({ type: 'rank', rank: this.rank });
    this.fillOffers();
    if (!silent) this.hints();
  }
  /** The first time the market opens, a sale of the company becomes possible, or a rush order is offered: one card that says what it is. */
  hints() {
    const seen = this.seen;
    if (!seen.market && this.market.open && this.marketOpen()) {
      seen.market = true;
      this.notice('Market', 'The market is open', 'Metropolis goods sell for a price that moves. Keep them in the warehouse and sell when it is high.', 'market');
    }
    if (!seen.sale && this.sellOffer().allowed) {
      seen.sale = true;
      this.notice('Legacy', 'You can sell the company', 'A sale pays legacy stars that raise every price for good, and you build again. See Expansion in your Headquarters.', 'star');
    }
    if (!seen.site && this.siteOpen) {
      seen.site = true;
      this.events.push({ type: 'site' });   // the game shows the plot, and words the card
    }
    if (!seen.rush && this.offers.some(o => o.limit)) {
      seen.rush = true;
      this.notice('Contract', 'A rush order came in', `It pays more, but the goods must be in the warehouse in time. Running out costs ${RUSH.repLoss} reputation.`, 'clock');
    }
  }
  /** null when the Headquarters tab is open to the player, else the hint that says what unlocks it. */
  tabLock(id) {
    const t = TABS.find(x => x.id === id), u = t?.unlock;
    if (!u) return null;
    if (u.contracts && this.stats.contracts < u.contracts) return t.hint;
    if (u.rank && this.rank < u.rank) return t.hint;
    if (u.location && !this.areas.some(a => a.location === u.location && this.econ.areaOpen(a.id))) return t.hint;
    if (u.yards && this.econ.areas.length < u.yards) return t.hint;
    return null;
  }

  // --- staff and costs ----------------------------------------------------------
  /** Workers and machines per open yard, read from the upgrades bought. */
  staff() {
    if (this._staff) return this._staff;
    const out = { yards: {}, workers: 0, machines: 0 };
    for (const a of this.areas) {
      if (!this.econ.areaOpen(a.id)) continue;
      let workers = 0, machines = a.stations.filter(s => s.type === 'processor').length;
      for (const u of a.upgrades) {
        if (!this.econ.has(u.id)) continue;
        if (u.effect.type === 'worker') workers++;
        else if (u.effect.type === 'station' && u.effect.station.type === 'processor') machines++;
      }
      out.yards[a.id] = { workers, machines };
      out.workers += workers; out.machines += machines;
    }
    return (this._staff = out);
  }
  /** Wages and upkeep per second for every open yard. Nothing is charged before the founding. */
  refreshCosts() {
    this._staff = null;
    const staff = this.staff();
    this.costTable = []; this.costPerSec = 0; this.salaryPerSec = 0;
    for (const a of this.areas) {
      const s = staff.yards[a.id];
      if (!s) continue;
      const ref = this.founded ? refIncome(this.index.get(a.id)) : 0;
      const row = { id: a.id, wages: s.workers * ref * FINANCE.wageShare * this.mods.wage, upkeep: s.machines * ref * FINANCE.upkeepShare * this.mods.upkeep };
      this.costTable.push(row);
      this.costPerSec += row.wages + row.upkeep;
    }
    // Managers are paid a share of what the whole company is expected to bring in.
    this.salaryPerSec = this.founded ? Object.keys(this.team).length * STAFF_RULES.salaryShare * this.companyRef() * this.mods.wage : 0;
    this.costPerSec += this.salaryPerSec;
  }
  costRate() { return this.costPerSec; }
  yardCost(id) { return this.costTable.find(r => r.id === id) || { id, wages: 0, upkeep: 0 }; }
  book(id) {
    let b = this.books.get(id);
    if (!b) { b = {}; for (const k of BOOK_KEYS) b[k] = new RateMeter(0, FINANCE.rateMemory); this.books.set(id, b); }
    return b;
  }
  /** Take a cost from the cash, never below zero. */
  charge(amount) {
    const paid = Math.min(this.econ.cash, amount);
    if (paid <= 0) return;
    this.econ.cash -= paid; this.stats.costs += paid; this.flow.costs.add(paid);
  }

  /** Start the income figure from what the workers were bringing in when the game was saved. */
  seedIncome(rate) { if (rate > 0) this.flow.income.rate = rate; }

  /** Called every frame of play. */
  tick(dt) {
    this.age += dt;
    this.records.played += dt;
    // "Most earned in one minute" is counted in whole minutes of play, one after the other.
    this.minute.t += dt;
    if (this.minute.t >= 60) {
      if (this.minute.sum > this.records.peakMinute) this.records.peakMinute = this.minute.sum;
      this.minute.t -= 60; this.minute.sum = 0;
    }
    if (this.founded && this.costPerSec > 0) this.charge(this.costPerSec * dt);
    if (this.market.open && this.marketOpen()) this.market.tick(dt);   // the market's clock is play time: it stands still while the player is away
    this.clock += dt;
    if (this.clock < SLOW_TICK) return;
    const t = this.clock; this.clock = 0;
    for (const b of this.books.values()) for (const k of BOOK_KEYS) b[k].tick(t);
    for (const m of Object.values(this.flow)) m.tick(t);
    for (const m of this.trips.values()) m.tick(t);
    for (const m of this.shopFlow.values()) m.tick(t);
    this.refreshIn = Math.max(0, this.refreshIn - t);
    this.settling = Math.max(0, this.settling - t);
    this.staleIn -= t;
    if (this.staleIn <= 0) { this.staleIn = CONTRACTS.staleSeconds; this.pruneOffers(); }
    this.refreshCosts();
    this.rushClock(t);
    this.watchMarket();
    if (tickStore(this, this.wall())) this.applyMods();   // a boost of the credits store ran out
    seasonStep(this);                                     // the month turned: the season closes, and a new one begins
    this.manage();
    this.sync();
  }

  // --- money events -------------------------------------------------------------
  /**
   * One item reaches a shop. While a running contract still needs it, it goes to the warehouse
   * and pays nothing now; otherwise it is sold. A good the player holds back goes to the warehouse too.
   * `price` is what the item sells for now, market included. Pay for time away must not be measured with it
   * but with the normal price (econ.price), or leaving the game at a high price would pay that price for hours.
   * @returns {{ price: number, cash: number, stocked: boolean, site?: boolean }}  site: it went to the building site
   */
  sale(item, areaId, byPlayer = false) {
    const normal = this.econ.price(item), price = normal * this.market.factor(item);
    this.stats.sold++; if (byPlayer) this.stats.byHand++;
    this.records.goods[item] = (this.records.goods[item] || 0) + 1;
    if (!this.shopFlow.has(item)) this.shopFlow.set(item, new RateMeter(0, FINANCE.rateMemory));
    this.shopFlow.get(item).add(1);
    // The building site takes what its stage needs, before goods the player holds back for the market (those are held
    // back to be sold later). A rush order comes first: its clock runs. Any other contract that needs the same good
    // shares it with the site, one good each, so that neither stands still for as long as the other takes.
    if (this.siteWants(item) > 0 && (this.contractsShort(item) <= 0 || (!this.rushNeeds(item) && (this.siteTurn = !this.siteTurn)))) {
      this.book(areaId).site.add(normal);   // not sold: booked at the normal price, like a good stocked for a contract
      this.give(item, 1);
      return { price, cash: 0, stocked: true, site: true };
    }
    if (this.founded && this.wanted(item) > 0) {
      this.stock[item] = (this.stock[item] || 0) + 1;
      this.book(areaId).stocked.add(normal);   // not sold yet: booked at the normal price
      for (const c of this.active) {
        if (this.readyIds.has(c.id) || !this.ready(c)) continue;
        this.readyIds.add(c.id); this.events.push({ type: 'ready', contract: c });
      }
      return { price, cash: 0, stocked: true };
    }
    this.income(price);
    this.book(areaId).sales.add(price);
    if (this.market.trades(item)) this.stats.marketSold++;
    return { price, cash: price, stocked: false };
  }
  /** Something was sold: a good at a shop, goods from the warehouse, a contract. The piggy bank of the credits store gets its share on top (js/sim/store.js, bankAdd). */
  income(amount) { this.econ.addCash(amount); this.stats.income += amount; this.flow.income.add(amount); this.minute.sum += amount; bankAdd(this, amount); }
  /** Income that should not move the per-minute figures (pay for time away). */
  earn(amount) { this.econ.addCash(amount); this.stats.income += amount; }
  /** A machine finished `n` batches: book the inputs another yard made as its income and this yard's materials. */
  batch(areaId, recipeId, n = 1) {
    if (!this.founded) return;
    const r = this.recipes[recipeId];
    for (const [item, count] of r ? [[r.input, r.inCount], [r.input2, r.inCount2]] : []) {
      const from = item && this.maker[item];
      if (!from || from === areaId) continue;
      const value = this.econ.price(item) * count * n;
      this.book(areaId).materials.add(value);
      this.book(from).supplied.add(value);
    }
  }

  // --- warehouse and contracts -----------------------------------------------------
  get capacity() { return Math.round(WAREHOUSE.capacity * this.mods.storage); }
  get slots() { return CONTRACTS.slots + this.mods.contractSlots; }
  /** How many of `item` all running contracts ask for. */
  reserved(item) {
    let n = 0;
    for (const c of this.active) for (const [i, qty] of c.needs) if (i === item) n += qty;
    return n;
  }
  /**
   * The most of `item` the warehouse takes for the running contracts: its limit, or what one running contract asks
   * for where that is more. An order is never larger than the warehouse it was offered by, but the warehouse can be
   * smaller later: the Bigger warehouse of the credits store rests when the server does not answer. The order
   * accepted before is still filled; what stands in the warehouse above the limit stays there.
   */
  room(item) {
    let most = this.capacity;
    for (const c of this.active) for (const [i, qty] of c.needs) if (i === item && qty > most) most = qty;
    return most;
  }
  /** How many more of `item` the warehouse should take from the shops: for the running contracts, or up to its limit for a good held back from the market. */
  wanted(item) {
    if (this.holding(item)) return this.room(item) - (this.stock[item] || 0);
    if (!this.active.length) return 0;
    return Math.min(this.reserved(item), this.room(item)) - (this.stock[item] || 0);
  }
  /** Running contracts in the order they take from the warehouse: rush orders first, because their time runs, then by age. */
  fillOrder() { return this.active.some(c => c.limit) ? [...this.active].sort((a, b) => (b.limit ? 1 : 0) - (a.limit ? 1 : 0)) : this.active; }
  /** Everything a contract needs is in the warehouse, after the contracts that come before it (see fillOrder) took theirs. */
  ready(contract) {
    const left = { ...this.stock };
    for (const c of this.fillOrder()) {
      const ok = c.needs.every(([item, qty]) => (left[item] || 0) >= qty);
      if (c === contract) return ok;
      if (ok) for (const [item, qty] of c.needs) left[item] -= qty;
    }
    return false;
  }
  /**
   * What of the warehouse each running contract has for itself: for its card and for what is still missing. Two orders
   * for the same good never count the same goods. As ready() has it, an order that can go takes its goods whole, in
   * the order of fillOrder; the others then share what is left, in that order too.
   * @returns {Map<object, Record<string, number>>}  contract -> item -> how many it has, never more than it asks for
   */
  shares() {
    const left = { ...this.stock }, out = new Map(), order = this.fillOrder();
    const take = c => {
      const mine = {};
      for (const [item, qty] of c.needs) { const n = Math.min(left[item] || 0, qty); mine[item] = n; left[item] = (left[item] || 0) - n; }
      out.set(c, mine);
    };
    for (const c of order) if (c.needs.every(([item, qty]) => (left[item] || 0) >= qty)) take(c);
    for (const c of order) if (!out.has(c)) take(c);
    return out;
  }
  /** Goods the player can make and sell now, oldest yard first. */
  producible() {
    const staff = this.staff(), out = [];
    for (const a of this.areas) {
      const r = this.recipes[this.yardRecipe[a.id]];
      if (r && staff.yards[a.id]?.machines > 0 && this.items[r.output]?.price > 0 && !out.includes(r.output)) out.push(r.output);
    }
    return out;
  }
  /** Items a minute of `item` reaching the shops, sold or stocked. */
  shopRate(item) { return this.shopFlow.get(item)?.rate || 0; }
  /**
   * Goods worth ordering. Planks that all go into the workshop never reach a shop, and an order for
   * them would never fill, so offers prefer goods that arrive fast enough to fill a small order in a few minutes.
   */
  orderable() {
    const all = this.producible(), small = this.capacity * CONTRACTS.kinds[0].size;
    const quick = all.filter(item => this.shopRate(item) * CONTRACTS.fillSeconds >= small);
    // A game that was just loaded has measured nothing yet: an offer made now would ask for the newest goods, which may
    // never reach a shop (robots, engines). It waits until a good is seen arriving fast enough, or until the wait is
    // over (settling). Which goods are asked for is otherwise as it was: it decides what a company can earn, and the
    // leaderboard's bound is set by that (tests/metropolis.test.mjs).
    if (!quick.length && this.settling > 0) return [];
    return (quick.length ? quick : all).slice(-CONTRACTS.recentItems);
  }
  /** Swap out offers for goods that have stopped reaching the shops, as long as other goods still do. */
  pruneOffers() {
    const small = this.capacity * CONTRACTS.kinds[0].size, slow = item => this.shopRate(item) * CONTRACTS.fillSeconds < small / 4;
    // A rush offer the yards can no longer make in time goes too, whatever else is on offer.
    this.offers = this.offers.filter(o => !o.limit || this.fillTime(o) <= o.limit);
    if (this.producible().every(slow)) return;
    this.offers = this.offers.filter(o => !o.needs.some(([item]) => slow(item)));
    this.fillOffers();
  }
  /**
   * How many of `item` an order of `kind` asks for. An order is sized by the warehouse, but never asks for
   * more than about five minutes of what reaches the shops: a company that was just sold has a big warehouse and a single saw.
   */
  orderSize(item, kind) {
    const reach = (this.shopRate(item) || CONTRACTS.assumedRate) * CONTRACTS.fillSeconds;
    return Math.max(5, Math.round(Math.min(this.capacity, reach) * kind.size / 5) * 5);
  }
  makeOffer() {
    const pool = this.orderable();
    if (!pool.length) return null;
    const n = this.seq++;
    const kinds = CONTRACTS.kinds.filter(k => !k.rush && k.items <= pool.length);   // a rush order comes by its own clock (rushClock)
    const kind = kinds[Math.floor(rand(n * 4 + 1) * kinds.length)];
    const picks = [];
    for (let i = 0; i < kind.items; i++) picks.push(pool.splice(Math.floor(rand(n * 4 + 2 + i) * pool.length), 1)[0]);
    return { id: n + 1, kind: kind.id, client: kind.clients[Math.floor(rand(n * 4 + 4) * kind.clients.length)], needs: picks.map(item => [item, this.orderSize(item, kind)]) };
  }
  // --- rush orders -------------------------------------------------------------------
  /** Seconds until everything a contract needs is in the warehouse, at the pace the goods reach the shops now. */
  fillTime(contract) {
    const running = this.active.includes(contract);
    let wait = 0;
    for (const [item, qty] of contract.needs) {
      const missing = qty - Math.min(qty, running ? this.stock[item] || 0 : this.freeStock(item));
      if (missing > 0) wait = Math.max(wait, missing / Math.max(this.shopRate(item), 1e-6));
    }
    return wait;
  }
  /**
   * A rush offer for a good that reaches the shops right now, or null when the yards could not make one in time.
   * The limit is what the goods need at the measured pace and half as much again, so it can be made, but not while standing still.
   */
  makeRush() {
    const pool = this.orderable().filter(item => this.shopRate(item) > 0);
    if (!pool.length) return null;
    const kind = CONTRACTS.kinds.find(k => k.rush), n = this.seq++;
    const item = pool[Math.floor(rand(n * 4 + 2) * pool.length)], qty = this.orderSize(item, kind);
    const need = qty / this.shopRate(item) * RUSH.slack;
    if (need > RUSH.maxLimit) return null;
    const limit = Math.max(RUSH.minLimit, Math.ceil(need / RUSH.step) * RUSH.step);
    return { id: n + 1, kind: kind.id, client: kind.clients[Math.floor(rand(n * 4 + 4) * kind.clients.length)], needs: [[item, qty]], limit };
  }
  /** The time of the running rush orders, and the offer of the next one. `t` is seconds of play. */
  rushClock(t) {
    if (!this.founded) return;
    for (const c of this.active.filter(x => x.limit)) {
      c.safe = this.ready(c);
      if (c.safe) continue;   // the goods are in the warehouse: nothing can run out any more
      c.left -= t;
      if (c.left <= 0) this.failRush(c, 'ran out');
    }
    this.rushIn = Math.max(0, this.rushIn - t);
    if (this.rushIn > 0 || this.stats.contracts < RUSH.after || [...this.offers, ...this.active].some(c => c.limit)) return;
    const offer = this.makeRush();
    if (!offer) { this.rushIn = RUSH.retry; return; }
    if (this.offers.length >= CONTRACTS.offers) this.offers.shift();   // it takes the place of the oldest offer
    this.offers.push(offer); this.rushIn = RUSH.every;
  }
  /** A rush order that ran out or was given up: it is gone, what was stocked stays, and the client thinks less of the company. */
  failRush(c, how) {
    this.active.splice(this.active.indexOf(c), 1); this.readyIds.delete(c.id);
    this.rep = Math.max(0, this.rep - RUSH.repLoss); this.stats.rushLate++;
    this.notice('Contract', `The rush order for ${c.client} ${how}`, `The goods stay in your warehouse. −${RUSH.repLoss} reputation.`, 'clock');
  }
  // --- regular clients ---------------------------------------------------------------
  /** 0 to 3: how well a client knows the company, from the orders delivered to it. */
  clientLevel(name) { const n = this.clients[name] || 0; return CLIENTS.levels.filter(at => n >= at).length; }
  /** The share a client's level adds to what its orders pay: 1% a level, twice that with Key accounts. */
  clientBonus(name) { return CLIENTS.bonus * this.mods.clientBonus * this.clientLevel(name); }
  /** Every client delivered to, the most loyal first: { name, orders, level, next } with next = orders for the next level, or null. */
  clientList() {
    return Object.entries(this.clients).map(([name, orders]) => ({ name, orders, level: this.clientLevel(name), next: CLIENTS.levels.find(at => orders < at) || null }))
      .sort((a, b) => b.orders - a.orders || (a.name < b.name ? -1 : 1));
  }
  fillOffers() {
    const same = (a, b) => a.kind === b.kind && a.needs.map(n => n[0]).sort().join() === b.needs.map(n => n[0]).sort().join();
    for (let tries = 0; this.offers.length < CONTRACTS.offers && tries < 12; tries++) {
      const o = this.makeOffer();
      if (!o) break;
      // no two offers alike, unless there is too little to choose from
      if (tries < 9 && [...this.offers, ...this.active].some(x => same(x, o))) continue;
      this.offers.push(o);
    }
  }
  /** What delivering a contract pays, at today's prices. */
  reward(contract) {
    const kind = kindOf(contract);
    let value = 0, tier = 0;
    for (const [item, qty] of contract.needs) {
      value += this.econ.price(item) * qty;
      tier = Math.max(tier, this.index.get(this.maker[item]) || 0);
    }
    const repBonus = 1 + Math.min(this.rep, CONTRACTS.repCap) * CONTRACTS.repBonus;
    const loyal = 1 + this.clientBonus(contract.client);   // a regular client pays a little more
    return { value, cash: Math.floor(value * (1 + kind.bonus) * this.mods.contractPay * repBonus * loyal), xp: Math.round(kind.xp * (1 + CONTRACTS.tierXp * tier)), rep: kind.rep };
  }
  accept(id) {
    const i = this.offers.findIndex(c => c.id === id);
    if (i < 0 || this.active.length >= this.slots) return false;
    const [c] = this.offers.splice(i, 1);
    if (c.limit) c.left = c.limit;   // the time of a rush order starts now
    this.active.push(c);
    if (this.ready(c)) this.readyIds.add(c.id);
    this.fillOffers();
    return true;
  }
  /** Give a contract up. What was stocked for it stays in the warehouse. Giving up a rush order costs what letting it run out costs. */
  abandon(id) {
    const i = this.active.findIndex(c => c.id === id);
    if (i < 0) return false;
    if (this.active[i].limit) { this.failRush(this.active[i], 'was given up'); return true; }
    this.active.splice(i, 1); this.readyIds.delete(id);
    return true;
  }
  /** @returns the reward paid, or null when the goods are not all there yet */
  deliver(id, byManager = false) {
    const c = this.active.find(x => x.id === id);
    if (!c || !this.ready(c)) return null;
    const reward = this.reward(c), bonus = useFlag(this, 'contractBonus');   // a Contract bonus of the credits store that waits is for this delivery only
    if (bonus !== 1) reward.cash = Math.floor(reward.cash * bonus);           // what is paid, reported and logged is the real amount
    for (const [item, qty] of c.needs) { this.stock[item] -= qty; if (this.stock[item] <= 0) delete this.stock[item]; }
    this.active.splice(this.active.indexOf(c), 1); this.readyIds.delete(id);
    this.income(reward.cash);
    this.rep += reward.rep; this.stats.contracts++;
    if (c.kind === 'project') this.stats.projects++;
    if (c.limit) this.stats.rush++;
    if (byManager) this.stats.autoDelivered++;
    if (CLIENT_NAMES.has(c.client)) {
      const was = this.clientLevel(c.client);
      this.clients[c.client] = Math.min(CLIENT_MAX, (this.clients[c.client] || 0) + 1);
      const level = this.clientLevel(c.client);
      if (level > was) this.notice('Contract', `${c.client} is a regular client`, `Level ${level} of ${CLIENTS.levels.length}: its orders now pay ${Math.round(this.clientBonus(c.client) * 100)}% more.`, 'contracts');
    }
    this.stats.bestContract = Math.max(this.stats.bestContract, reward.cash);
    this.gainXp(reward.xp);
    this.sync();
    return reward;
  }
  /**
   * "New offers" of the credits store: the contract board is drawn again now, whatever the wait of the free button,
   * and that wait is left as it is. A rush offer stays where it is (it comes by its own clock, seldom, and pays best);
   * running contracts are not touched. Only an offer that was not on the board before counts: the same kind of order
   * for the same goods would be credits spent on nothing. The board is drawn four times and the draw that changes the
   * most offers is kept (offersRedraw); when none changes any, nothing is touched.
   * @param dry  true: only say what a redraw would do
   * @returns how many offers on the board are new, 0 when the board could not be changed
   */
  redrawOffers(dry = false) {
    if (!this.founded) return 0;
    const best = this.offersRedraw();
    if (!dry && best.changed) { this.offers = best.offers; this.seq = best.seq; }
    return best.changed;
  }
  /**
   * What redrawOffers() would put on the board now, without changing anything (the board and the offer counter are
   * put back as they were, the same array). An offer is new when the old board has no offer of its kind for its goods,
   * counted as a multiset: two alike on the new board are both old only if the old board had two alike. A draw follows
   * the offer counter, so the same company draws the same boards: what this says before a purchase is what it does.
   * @returns {{ offers: object[], seq: number, changed: number }} the best of four draws (the most new offers, the
   *          first of equals): its board, the offer counter after it, and how many of its offers are new
   */
  offersRedraw() {
    const before = this.offers, seq = this.seq, keep = before.filter(o => o.limit);
    const key = o => o.kind + ':' + o.needs.map(n => n[0]).sort().join();
    let best = { offers: before, seq, changed: 0 };
    for (let tries = 0; tries < 4; tries++) {
      this.offers = [...keep]; this.fillOffers();
      const left = before.filter(o => !keep.includes(o)).map(key), drawn = this.offers.filter(o => !keep.includes(o));
      let changed = 0;
      for (const o of drawn) { const i = left.indexOf(key(o)); if (i < 0) changed++; else left.splice(i, 1); }
      if (changed > best.changed) best = { offers: this.offers, seq: this.seq, changed };
      if (changed === drawn.length && changed > 0) break;   // every drawn offer is new: no later draw can do better
    }
    this.offers = before; this.seq = seq;
    return best;
  }
  canRefresh() { return this.refreshIn <= 0; }
  newOffers() {
    if (!this.canRefresh()) return false;
    this.offers = []; this.fillOffers(); this.refreshIn = CONTRACTS.refreshSeconds;
    return true;
  }
  /** Sell what no running contract needs, at what it sells for now (the market price for a market good). @returns the cash received */
  sellStock(item) {
    const free = this.freeStock(item);
    if (free <= 0) return 0;
    const cash = free * this.price(item);
    this.stock[item] -= free; if (this.stock[item] <= 0) delete this.stock[item];
    this.income(cash);
    if (this.market.open && this.market.trades(item)) {   // the records of the market: what was sold, and how much of it for a good price
      const factor = this.market.factor(item);
      this.stats.marketSold += free;
      if (factor >= MARKET.goodPrice - EPS) this.stats.marketGood += free;
      if (factor >= MARKET.topPrice - EPS) this.stats.marketTop += free;
    }
    // The yard was credited with these goods at the normal price when they were stocked: only what the market added or took is new.
    if (this.maker[item]) this.book(this.maker[item]).sales.add(cash - free * this.econ.price(item));
    return cash;
  }
  /** How many of `item` in the warehouse no running contract needs. */
  freeStock(item) { const have = this.stock[item] || 0; return have - Math.min(this.reserved(item), have); }

  // --- the market ---------------------------------------------------------------------
  /** True while a yard of a market location is open: only then does the market's clock run. */
  marketOpen() { return this.marketYards.some(id => this.econ.areaOpen(id)); }
  /** What one `item` sells for right now: the normal price, moved by the market if it is traded there. */
  price(item) { return this.econ.price(item) * this.market.factor(item); }
  holding(item) { return this.market.open && !!this.market.hold[item]; }
  /** Keep a market good in the warehouse instead of selling it (until the warehouse is full), or stop doing so. */
  setHold(item, on) {
    if (!this.market.open || !this.market.trades(item)) return false;
    if (on) this.market.hold[item] = true; else delete this.market.hold[item];
    return true;
  }
  /**
   * One line of the Market tab per good: prices, the difference to normal, and what is in the warehouse.
   * alert: the player asked to be told when the price is high. next: the price after this one, as a multiple
   * of normal, for a company that has researched the Market forecast; null for everyone else.
   */
  marketReport() {
    if (!this.market.open) return [];
    return this.market.goods.map(item => {
      const normal = this.econ.price(item), factor = this.market.factor(item);
      return { item, yard: this.maker[item], made: this.econ.areaOpen(this.maker[item]), normal, price: normal * factor, factor, diff: factor - 1,
        stock: this.stock[item] || 0, free: this.freeStock(item), holding: this.holding(item),
        alert: !!this.market.alert[item], next: this.mods.forecast ? this.market.nextFactor(item) : null };
    });
  }
  /** Mark a market good, or unmark it: a marked good is announced when its price rises to MARKET.alertAt times normal. */
  setAlert(item, on) {
    if (!this.market.open || !this.market.trades(item)) return false;
    if (on) this.market.alert[item] = true; else delete this.market.alert[item];
    return true;
  }
  /** Once per price step: say so when a marked good has just risen to the alert price. A price that stays high is not announced again. */
  watchMarket() {
    const m = this.market;
    if (!m.open || m.step === this.marketStep) return;
    const first = this.marketStep == null;
    this.marketStep = m.step;
    if (first) return;   // the game has just loaded: this price was there before, and was announced then
    for (const item of m.goods) {
      if (!m.alert[item] || !m.rose(item, MARKET.alertAt)) continue;
      const pct = Math.round((m.factor(item) - 1) * 100);
      this.notice('Market', `${cap(this.items[item].label)} are ${pct}% above normal`, 'Sell from the Market tab while the price lasts.', 'bell');
    }
  }
  /** The Sales Manager's switch can be used once he is trained far enough. */
  canAutoSell() { return (this.team.sales || 0) >= MARKET.autoSellLevel; }
  /**
   * What a fully trained Sales Manager does when switched on: goods the player keeps in the warehouse are sold
   * as soon as their price is MARKET.autoSellAt times normal or more. It is the same sale as the button's, at a
   * price a patient player would also take; he never sells what a contract needs or what is not kept back.
   */
  autoSell() {
    if (!this.settings.autoSell || !this.canAutoSell() || !this.market.open) return;
    for (const item of this.market.goods) {
      const free = this.freeStock(item), factor = this.market.factor(item);
      if (!this.holding(item) || free <= 0 || factor < MARKET.autoSellAt - EPS) continue;
      const cash = this.sellStock(item);
      this.events.push({ type: 'sold', item, count: free, cash, factor });
      this.notice('Market', `Sold ${fmt(free)} ${this.items[item].label}`, `Your Sales Manager got $${fmt(cash)}, ${Math.round((factor - 1) * 100)}% above normal`, 'market');
    }
  }

  // --- research ---------------------------------------------------------------------
  researchState(r) {
    const level = this.level(r.id), max = r.levels || 1;
    const cost = Math.round(r.cost * Math.pow(r.costGrowth || 1, level) * this.mods.researchCost);   // Lab Day makes research cheaper
    let lock = null;
    if (this.rank < (r.rank || 0)) lock = 'Needs the rank ' + RANKS[r.rank].name;
    else {
      const missing = (r.needs || []).find(id => !this.level(id));
      if (missing) lock = 'Needs ' + RESEARCH.find(x => x.id === missing).name;
      else if (r.location && !this.areas.some(a => a.location === r.location && this.econ.areaOpen(a.id))) lock = `Open ${LOCATIONS.find(l => l.id === r.location).name} first`;
    }
    return { level, max, done: level >= max, cost, lock, affordable: this.econ.cash >= cost };
  }
  buyResearch(id) {
    const r = RESEARCH.find(x => x.id === id);
    if (!r || !this.founded || this.tabLock('research')) return false;
    const st = this.researchState(r);
    if (st.done || st.lock || !this.econ.spend(st.cost)) return false;
    this.research[id] = st.level + 1; this.spent += st.cost;
    this.applyMods(); this.refreshCosts(); this.sync();
    return true;
  }

  // --- truck routes -------------------------------------------------------------------
  routeState(def) {
    let lock = null;
    if (!this.mods.routes) lock = 'Research Trucking first';
    else if (!this.econ.areaOpen(def.from) || !this.econ.areaOpen(def.to)) lock = 'Open both yards first';
    return { owned: !!this.routes[def.id], lock, affordable: this.econ.cash >= def.cost, perMinute: (this.trips.get(def.id)?.rate || 0) * 60 };
  }
  buyRoute(id) {
    const def = this.routeDefs.find(d => d.id === id);
    if (!def || this.routes[id] || this.routeState(def).lock || !this.econ.spend(def.cost)) return false;
    this.routes[id] = true; this.spent += def.cost;
    this.sync();
    return true;
  }
  /**
   * Run the trucks. `move(route)` shifts one item from the maker's finished goods to the user's
   * input in the caller's world and returns false when it cannot (nothing to take, or no room).
   */
  runRoutes(dt, move) {
    if (!this.mods.routes) return;
    for (const d of this.routeDefs) {
      if (!this.routes[d.id]) continue;
      let acc = (this.acc[d.id] || 0) + ROUTES.rate * this.mods.routeRate * dt;
      while (acc >= 1) {
        if (!move(d)) { acc = 1; break; }   // the truck waits, loaded
        acc -= 1;
        const fee = this.econ.price(d.item) * FINANCE.transportShare * this.mods.truckFee;
        this.charge(fee); this.flow.transport.add(fee); this.stats.trucked++;
        if (!this.trips.has(d.id)) this.trips.set(d.id, new RateMeter(0, FINANCE.rateMemory));
        this.trips.get(d.id).add(1);
      }
      this.acc[d.id] = acc;
    }
  }

  // --- reports (dollars per second) ------------------------------------------------------
  invested() { return this.spent + Object.values(this.econ.paid).reduce((a, b) => a + num(b), 0); }
  summary() {
    const wages = this.costTable.reduce((a, r) => a + r.wages, 0), upkeep = this.costTable.reduce((a, r) => a + r.upkeep, 0);
    // Wages and upkeep are known exactly; income and truck fees are measured over the last minute.
    const salaries = this.salaryPerSec;
    const income = this.flow.income.rate, costs = wages + upkeep + salaries + this.flow.transport.rate;
    const invested = this.invested();
    return { income, costs, profit: income - costs, wages, upkeep, salaries, transport: this.flow.transport.rate, invested,
      valuation: this.econ.cash + invested + FINANCE.valuationSeconds * Math.max(0, income - costs) };
  }
  yardReport(id) {
    const b = this.book(id), cost = this.yardCost(id), staff = this.staff().yards[id] || { workers: 0, machines: 0 };
    const income = b.sales.rate + b.supplied.rate + b.stocked.rate + b.site.rate;
    const costs = { materials: b.materials.rate, wages: cost.wages, upkeep: cost.upkeep };
    const total = costs.materials + costs.wages + costs.upkeep;
    const biggest = Object.keys(costs).reduce((a, k) => (costs[k] > costs[a] ? k : a), 'wages');
    return { id, income, sales: b.sales.rate, supplied: b.supplied.rate, stocked: b.stocked.rate, site: b.site.rate, costs, total, profit: income - total, biggest, ...staff };
  }
  // --- managers ---------------------------------------------------------------------------------
  /**
   * Dollars per second the company is expected to bring in: each open yard's reference income times
   * the share of its upgrades that are bought. Salaries and goals are a share of this, so they follow
   * what is really built and not a yard that has only just been opened.
   */
  companyRef() {
    let sum = 0;
    this.areas.forEach((a, i) => {
      if (!this.econ.areaOpen(a.id)) return;
      const built = a.upgrades.filter(u => this.econ.has(u.id)).length / Math.max(1, a.upgrades.length);
      sum += refIncome(i) * built;
    });
    return sum;
  }
  /**
   * The next purchase of every open yard, for the Advisor Pro of the credits store (js/sim/advice.js, bestPurchase):
   * [{ id, yard, name, label, cost, gain, opens }]. `cost` is what is still to pay; `gain` is what it adds, in dollars a
   * second, to the income the company is built for, by the same reckoning as companyRef(): every purchase of a yard is an
   * equal share of that yard's reference income, at today's prices. A gate earns nothing by itself, so it stands for
   * the whole yard behind it: `cost` is the gate and every purchase of that yard, `gain` that yard's reference income,
   * and `opens` its name.
   */
  nextPurchases() {
    const out = [], price = this.mods.price;
    this.areas.forEach((a, i) => {
      if (!this.econ.areaOpen(a.id)) return;
      const u = this.econ.nextUpgrade(a.id);
      if (!u) return;
      if (u.effect.type !== 'area') {
        out.push({ id: u.id, yard: a.id, name: a.name, label: u.label, cost: this.econ.remaining(u.id), gain: refIncome(i) / Math.max(1, a.upgrades.length) * price, opens: null });
        return;
      }
      const j = this.index.get(u.effect.area), next = this.areas[j];
      if (!next) return;
      const cost = next.upgrades.reduce((sum, x) => sum + this.econ.remaining(x.id), this.econ.remaining(u.id));
      out.push({ id: u.id, yard: a.id, name: a.name, label: u.label, cost, gain: refIncome(j) * price, opens: next.name });
    });
    return out;
  }
  staffState(def) {
    const level = this.team[def.id] || 0, max = def.effects.length;
    const cost = Math.round(def.cost * Math.pow(STAFF_RULES.trainGrowth, level));
    let lock = null;
    if (this.rank < def.rank) lock = 'Needs the rank ' + RANKS[def.rank].name;
    else { const missing = (def.needs || []).find(id => !this.level(id)); if (missing) lock = 'Needs ' + RESEARCH.find(x => x.id === missing).name; }
    return { level, max, done: level >= max, cost, lock: level ? null : lock, affordable: this.econ.cash >= cost, next: def.levels[level] || null };
  }
  /** Hire a manager, or train one already hired to the next level. */
  hire(id) {
    const def = STAFF.find(x => x.id === id);
    if (!def || !this.founded || this.tabLock('team')) return false;
    const st = this.staffState(def);
    if (st.done || st.lock || !this.econ.spend(st.cost)) return false;
    this.team[id] = st.level + 1; this.spent += st.cost;
    this.applyMods(); this.refreshCosts(); this.sync();
    return true;
  }
  /**
   * The offer with the largest bonus for the time it will take to fill, judged by what reaches the shops now.
   * A rush order counts only while the goods can be there with time to spare; null when nothing is worth taking.
   */
  bestOffer() {
    const worth = x => {
      const r = this.reward(x), wait = Math.max(...x.needs.map(([item, qty]) => qty / Math.max(this.shopRate(item), 1e-3)));
      return (r.cash - r.value) / wait;
    };
    // An order whose goods are not reaching the shops would hold its place for good: only the player takes such a one.
    const pool = this.offers.filter(o => this.fillTime(o) <= CONTRACTS.fillSeconds * CONTRACTS.slowTimes && (!o.limit || this.fillTime(o) * RUSH.margin <= o.limit));
    return pool.length ? pool.reduce((a, b) => (worth(b) > worth(a) ? b : a)) : null;
  }
  /** What the Warehouse Manager does by himself: the same deliver and accept the buttons call. */
  manage() {
    if (!this.founded) return;
    if (this.mods.autoDeliver) {
      for (const c of [...this.active]) {
        if (!this.ready(c)) continue;
        const reward = this.deliver(c.id, true);
        this.events.push({ type: 'delivered', contract: c, reward });
      }
    }
    if (this.mods.autoAccept) {
      while (this.active.length < this.slots) { const best = this.bestOffer(); if (!best || !this.accept(best.id)) break; }   // fill the free places
    }
    this.autoSell();
  }
  gainXp(n) {
    const before = this.rank;
    this.xp += n;
    if (this.rank > before) this.events.push({ type: 'rank', rank: this.rank });
  }

  // --- daily and weekly goals ---------------------------------------------------------------------
  /** The lifetime counter a goal kind is measured by. */
  counter(kind) {
    switch (kind) {
      case 'income': return this.stats.income;
      case 'sold': return this.stats.sold;
      case 'contracts': return this.stats.contracts;
      case 'upgrades': return Object.keys(this.econ.unlocked).length;
      case 'trucked': return this.stats.trucked;
      case 'research': return this.measure('research');
      default: return 0;
    }
  }
  /**
   * Goal kinds the player can finish in the period: enough upgrades left in the game to buy, a truck
   * route to run, and research that is unlocked and costs no more than the cash on hand plus what the
   * period's earning goal asks for. A goal nobody can reach is worse than no goal.
   */
  possibleKinds(period = 'daily') { return GOALS.kinds.filter(k => this.goalPossible(k.id, k[period], GOALS[period].earnSeconds)); }
  /** Can `n` of a goal kind be done, by a company that will earn about `earnSeconds` of its reference income in the time it has? */
  goalPossible(kind, n, earnSeconds) {
    const within = this.econ.cash + this.goalRef() * earnSeconds;
    switch (kind) {
      case 'upgrades': return this.econ.upgrades.filter(u => !this.econ.has(u.id)).length >= n;
      case 'trucked': return Object.keys(this.routes).length > 0;
      case 'research': return !this.tabLock('research') && RESEARCH.filter(r => { const st = this.researchState(r); return !st.done && !st.lock && st.cost <= within; }).length >= n;
      default: return true;
    }
  }
  /**
   * What goal targets and rewards are a share of: the company's reference income, but never less than
   * one finished Sawmill, so a company that was just sold (nothing built yet) still gets real goals.
   */
  goalRef() { return Math.max(this.companyRef(), FINANCE.baseIncome); }
  /**
   * After a sale: every goal not collected yet is offered again at the size of the new company. One the new company
   * cannot finish (goods to truck with the routes gone, research it cannot pay for) becomes a goal of a kind that is
   * not on the list and that it can finish; for the event, whose goal has one size, an earning goal, as on the day
   * the event starts for a company that cannot finish it (refreshGoals).
   */
  rescaleGoals() {
    const ref = this.goalRef();
    for (const period of PERIODS) {
      const rule = period === 'event' ? EVENT_GOAL : GOALS[period], have = new Set(this.goals[period].map(g => g.kind));
      this.goals[period] = this.goals[period].map(g => {
        if (g.claimed) return g;
        let { kind, target } = g;
        if (!this.goalPossible(kind, target, rule.earnSeconds)) {
          const next = GOALS.kinds.find(k => !have.has(k.id) && (k.money || k[period] != null) && this.goalPossible(k.id, k[period], rule.earnSeconds));
          if (next) { have.delete(kind); have.add(next.id); kind = next.id; target = next[period]; }
        }
        // counted from now, in whole units: the save that follows a sale keeps the counters rounded, and a base with a fraction would read as "$0.35 earned" after the reload
        return { ...g, kind, told: false, base: Math.round(this.counter(kind)),
          target: kind === 'income' ? Math.round(ref * rule.earnSeconds) : target, cash: Math.round(ref * rule.paySeconds) };
      });
    }
    this.goals.bonusCash = Math.round(ref * GOALS.daily.bonusSeconds);
  }
  /** How many goals a day has: three, and one more with the Fourth daily goal of the credits store. Never more than there are kinds, or than a save keeps. */
  dailyCount() { return Math.min(GOALS.kinds.length, GOALS.daily.count + Math.max(0, Math.floor(this.mods.dailyGoals || 0))); }
  /** How many of today's goals must be collected for the daily bonus: all of them, but never more than three. A fourth goal is extra, and never makes the bonus harder. */
  bonusNeeds() { return Math.min(this.goals.daily.length, GOALS.daily.count); }
  makeGoals(period, seed) {
    const rule = GOALS[period], ref = this.goalRef(), pool = this.possibleKinds(period), out = [], count = period === 'daily' ? this.dailyCount() : rule.count;
    while (out.length < count && pool.length) {
      const kind = pool.splice(Math.floor(rand(seed * 5 + out.length) * pool.length), 1)[0];
      const target = kind.id === 'income' ? Math.round(ref * rule.earnSeconds) : kind[period];
      out.push({ kind: kind.id, target, base: this.counter(kind.id), cash: Math.round(ref * rule.paySeconds), xp: rule.xp, claimed: false, told: false });
    }
    return out;
  }
  /**
   * Offer new goals when the calendar has moved on. `day` is the player's local day number
   * (days since 1970). A day earlier than the last one seen changes nothing.
   */
  refreshGoals(day) {
    if (!(day > 0)) return;
    if (day > this.away.day) this.away = { day, used: 0 };   // the time-away allowance refills, company or not
    if (!this.founded) return;
    if (day > this.goals.day) {
      this.goals.day = day; this.goals.daily = this.makeGoals('daily', day);
      this.goals.bonus = false; this.goals.bonusCash = Math.round(this.goalRef() * GOALS.daily.bonusSeconds);
    }
    this.extraGoal();
    const week = Math.floor((day + 3) / 7);   // weeks start on Monday
    if (week > this.goals.week) { this.goals.week = week; this.goals.weekly = this.makeGoals('weekly', week + 100000); }
    // The event of the day: its boost joins the modifiers and its goal is offered; both end with it.
    const event = EVENTS.find(e => e.days.includes((this.goals.day + 4) % 7)) || null;   // day 0 was a Thursday
    if ((event?.id || '') !== this.goals.eventId) {
      this.goals.eventId = event?.id || '';
      // The event's own goal, or an earning goal for a company that cannot finish it (no truck route yet, no research in reach).
      const goal = !event || this.goalPossible(event.goal.kind, event.goal.target, EVENT_GOAL.earnSeconds) ? event?.goal
        : { kind: 'income', target: Math.round(this.goalRef() * EVENT_GOAL.earnSeconds) };
      this.goals.event = event ? [{ kind: goal.kind, target: goal.target, base: this.counter(goal.kind),
        cash: Math.round(this.goalRef() * EVENT_GOAL.paySeconds), xp: EVENT_GOAL.xp, claimed: false, told: false }] : [];
      this.applyMods(); this.refreshCosts();
    }
  }
  /**
   * The Fourth daily goal of the credits store, for a day whose goals were drawn before the server said it is owned
   * (every visit starts that way), or when no fourth kind was possible then: one goal of a kind not on today's list is
   * added, starting at nothing, at the size the day's goals are drawn at. Called once a second with refreshGoals(), and
   * when the server's answer changes. A goal once listed stays for its day, owned or not: it is in the save.
   * @returns whether a goal was added
   */
  extraGoal() {
    const list = this.goals.daily;
    if (!this.founded || !(this.goals.day > 0) || !(this.mods.dailyGoals > 0) || list.length >= this.dailyCount()) return false;
    const have = new Set(list.map(g => g.kind)), pool = this.possibleKinds('daily').filter(k => !have.has(k.id));
    if (!pool.length) return false;
    const kind = pool[Math.floor(rand(this.goals.day * 5 + list.length) * pool.length)], ref = this.goalRef();
    const target = kind.id === 'income' ? Math.round(ref * GOALS.daily.earnSeconds) : kind.daily;
    list.push({ kind: kind.id, target, base: this.counter(kind.id), cash: Math.round(ref * GOALS.daily.paySeconds), xp: GOALS.daily.xp, claimed: false, told: false });
    return true;
  }
  /**
   * "New goals" of the credits store: today's unfinished daily goals are exchanged for kinds that are not on today's
   * list, as far as there are such kinds, the goal furthest from done first. A goal that is done or collected stays as
   * it is, so nothing is collected twice and no finished work is thrown away; a new goal starts at nothing and pays
   * what the old one paid. The day's free swap is not used up.
   * @param dry  true: only say how many would be drawn
   * @returns how many goals were drawn again, 0 when nothing could be
   */
  redrawGoals(dry = false) {
    const { goals: drawn, pool } = this.goalsToRedraw();
    if (dry) return drawn.length;
    for (const old of drawn) {
      const kind = pool.splice(Math.floor(rand(this.goals.day * 13 + old.index) * pool.length), 1)[0];
      const target = kind.id === 'income' ? Math.round(this.goalRef() * GOALS.daily.earnSeconds) : kind.daily;
      this.goals.daily[old.index] = { kind: kind.id, target, base: this.counter(kind.id), cash: old.cash, xp: old.xp, claimed: false, told: false };
    }
    return drawn.length;
  }
  /**
   * What redrawGoals() would exchange now, without changing anything: the unfinished daily goals furthest from done
   * first (as goalList() gives them, with their progress in `value`), as many as there are kinds not on today's list;
   * `open` is how many are unfinished, `pool` the kinds they would be drawn from.
   */
  goalsToRedraw() {
    if (!this.founded || !(this.goals.day > 0)) return { goals: [], open: 0, pool: [] };
    const open = this.goalList('daily').filter(g => !g.claimed && !g.done).sort((a, b) => a.value / Math.max(a.target, 1) - b.value / Math.max(b.target, 1) || a.index - b.index);
    const have = new Set(this.goals.daily.map(g => g.kind)), pool = this.possibleKinds('daily').filter(k => !have.has(k.id));
    return { goals: open.slice(0, Math.min(open.length, pool.length)), open: open.length, pool };
  }
  /**
   * Exchange one daily goal for another kind the company can finish, once a day. The new goal starts at
   * nothing and pays what the old one paid. @returns the new goal, or null when no swap is possible
   */
  swapGoal(index) {
    const old = this.goalList('daily')[index];
    if (!this.canSwap() || !old || old.claimed || old.done) return null;
    const have = new Set(this.goals.daily.map(g => g.kind));
    const pool = this.possibleKinds('daily').filter(k => !have.has(k.id));
    if (!pool.length) return null;
    const kind = pool[Math.floor(rand(this.goals.day * 11 + index) * pool.length)];
    const target = kind.id === 'income' ? Math.round(this.goalRef() * GOALS.daily.earnSeconds) : kind.daily;
    this.goals.daily[index] = { kind: kind.id, target, base: this.counter(kind.id), cash: old.cash, xp: old.xp, claimed: false, told: false };
    this.goals.swapDay = this.goals.day;
    return this.goals.daily[index];
  }
  canSwap() { return this.founded && this.goals.day > 0 && this.goals.swapDay !== this.goals.day; }

  // --- the daily streak ------------------------------------------------------------------------------
  /**
   * The streak as it stands on the day of today's goals. count: days in a row. claimed: today is already
   * counted. bonus: the share added to the first daily goal collected today (0 once it has been collected).
   * A day counts when a daily goal is collected on it; each missed day takes one day off, down to one.
   */
  streakInfo() {
    const s = this.streak, day = this.goals.day, share = n => STREAK.step * Math.max(0, n - 1);
    if (s.day >= day && s.day > 0) return { count: s.count, claimed: true, bonus: 0, paid: share(s.count), best: s.best, missed: 0 };
    const missed = s.day ? day - s.day - 1 : 0;
    const count = !s.day ? 1 : missed > 0 ? Math.max(1, s.count - missed) : Math.min(STREAK.cap, s.count + 1);
    return { count, claimed: false, bonus: share(count), paid: 0, best: s.best, missed };
  }
  /** The event running today by the calendar, or null. */
  eventNow() { return (this.founded && EVENTS.find(e => e.id === this.goals.eventId)) || null; }
  /** The events an Event ticket of the credits store started and that still run, by the wall clock: [{ event, until }]. In the save each is a boost under the event's name. */
  ticketEvents() {
    const now = this.wall();
    return this.store.boosts.filter(b => b.until > now).map(b => ({ event: EVENTS.find(e => 'event' + e.id === b.stat), until: b.until })).filter(t => t.event);
  }
  /** Every event that runs now: today's, and those a ticket started. An event counts once, however it came to run. */
  eventsNow() {
    const today = this.eventNow(), out = today ? [today] : [];
    if (this.founded) for (const t of this.ticketEvents()) if (!out.includes(t.event)) out.push(t.event);
    return out;
  }
  /** The name of the event a boost of the store stands for, or null: for the chips beside the cash (js/sim/store.js, boostChips). */
  boostName(stat) { return EVENTS.find(e => 'event' + e.id === stat)?.name || null; }
  /**
   * What an Event ticket can start, for the store's page: { tickets, hours, events: [{ id, name, desc, running, adds, why }] }.
   * tickets: how many were bought and wait for a choice; hours: what a ticket runs for, by the wall clock (the hours it
   * was bought for, in its flag; a ticket written before that was kept, the catalog's). An event counts once, however it
   * came to run: one that runs already cannot be chosen, and `adds` is the whole hours a ticket would really add now,
   * its hours less those in which the calendar runs the same event. `why`: why it cannot be chosen now (it would add
   * less than an hour, or no more boosts can run), or null.
   */
  ticketChoices() {
    const running = this.eventsNow(), flag = this.store.flags.eventTicket, fromCatalog = num(itemDoing(this, 'event_ticket')?.params?.hours);
    const hours = flag && flag.value > 1 ? num(flag.value) : fromCatalog || num(flag?.value);
    const full = this.store.boosts.length >= MAX_BOOSTS;
    return { tickets: flag?.left || 0, hours, events: EVENTS.map(e => {
      const adds = this.ticketAdds(e, hours), is = running.includes(e);
      const why = is ? null : full ? `No event can start while ${MAX_BOOSTS} boosts run. Choose one once a boost has ended.`
        : adds < 1 ? 'The calendar brings it within the ticket\'s hours: a ticket would add less than an hour.' : this.ticketUseless(e);
      return { id: e.id, name: e.name, desc: e.desc, running: is, adds, why };
    }) };
  }
  /**
   * Why an event would be worth nothing to this company now, so that a ticket is not spent on it, or null. Truck Day
   * waives the trucks' fees: without a truck route there is none. Lab Day takes some off research: with every research
   * done there is nothing left to take it off (measured: tools/credits/measure.mjs --offers).
   */
  ticketUseless(event) {
    if (event.effect?.stat === 'truckFee' && !Object.keys(this.routes).length) return `You have no truck routes yet: ${event.name} would save you nothing.`;
    if (event.effect?.stat === 'researchCost' && RESEARCH.every(r => this.researchState(r).done)) return `Nothing is left to research: ${event.name} would give you nothing.`;
    return null;
  }
  /**
   * The whole hours a ticket for `event` would add from now: `hours` by the wall clock, less those in which the calendar
   * runs the same event. The calendar's day is the one the goals were drawn for, and every next day starts at the
   * player's midnight.
   */
  ticketAdds(event, hours) {
    const now = this.wall(), end = now + hours * 3600000;
    if (!Number.isFinite(end) || !(hours > 0)) return 0;
    let day = this.goals.day || Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000), at = now, own = 0;
    for (let i = 0; at < end && i < 400; i++, day++) {
      const midnight = new Date(at).setHours(24, 0, 0, 0), to = Math.min(midnight, end);
      if (event.days.includes((day + 4) % 7)) own += to - at;   // day 0 was a Thursday
      at = to;
    }
    return Math.floor((end - now - own) / 3600000);
  }
  /**
   * Use a waiting Event ticket: the event `id` runs from now for the ticket's hours, by the wall clock, beside today's
   * own event. The ticket is used only when the event starts. @returns {{ event, until, adds, hours }} (adds: the hours it
   * adds to what the calendar runs) or null (no ticket waits, no company yet, no such event, it runs already, or it cannot
   * be chosen now: ticketChoices() says why)
   */
  useTicket(id) {
    const event = EVENTS.find(e => e.id === id), c = this.ticketChoices(), until = this.wall() + c.hours * 3600000, choice = c.events.find(e => e.id === id);
    if (!event || !this.founded || !(c.tickets > 0) || !(c.hours > 0) || !choice || choice.running || choice.why) return null;
    if (!startEvent(this, event.id, until)) return null;
    useFlag(this, 'eventTicket');
    this.applyMods(); this.refreshCosts();
    return { event, until, adds: choice.adds, hours: c.hours };
  }
  goalList(period) {
    return this.goals[period].map((g, index) => {
      const value = Math.max(0, Math.min(g.target, this.counter(g.kind) - g.base));
      return { ...g, index, period, value, done: value >= g.target };
    });
  }
  goalsWaiting() { return PERIODS.reduce((n, p) => n + this.goalList(p).filter(g => g.done && !g.claimed).length, 0); }
  /**
   * What of the credits store's offers waits for the player in the Headquarters: { season, tickets }. season: the step
   * of the season whose gift, or a holder's boost that can start or wait, is there to collect (0: none); tickets: Event
   * tickets that wait for their choice. The dot on the Headquarters' button and the Overview's list count them.
   */
  offersWaiting() {
    // while the store block is not known (storeUnsure) the season's steps are not collected (js/game/store.js, collectSeason)
    const s = this.storeUnsure ? null : seasonState(this), boost = !!s && s.rewards > 0 && !!s.next && !s.stuck;
    return { season: s && s.gifts > 0 ? s.free + 1 : boost ? s.held + 1 : 0, tickets: this.store.flags.eventTicket?.left || 0 };
  }
  /** Collect a finished goal. @returns {{ cash, xp, bonus }} or null */
  claimGoal(period, index) {
    const g = this.goalList(period)[index];
    if (!g || !g.done || g.claimed) return null;
    this.goals[period][index].claimed = true;
    seasonPoints(this, period);   // the season of the credits store: a goal collected is points, for every player
    const out = { cash: g.cash, xp: g.xp, bonus: false };
    if (period === 'daily') {   // the first daily goal of the day counts the day for the streak, and carries its bonus
      const s = this.streakInfo();
      if (!s.claimed) {
        this.streak = { day: this.goals.day, count: s.count, best: Math.max(this.streak.best, s.count) };
        out.streak = s.count; out.streakCash = Math.floor(g.cash * s.bonus); out.cash += out.streakCash;
      }
    }
    if (period === 'daily' && !this.goals.bonus && this.goals.daily.filter(x => x.claimed).length >= this.bonusNeeds()) {
      this.goals.bonus = true; this.stats.dailySets++;
      out.cash += this.goals.bonusCash; out.xp += GOALS.daily.bonusXp; out.bonus = true;
    }
    this.earn(out.cash);
    this.gainXp(out.xp);
    this.sync();
    return out;
  }

  // --- achievements ---------------------------------------------------------------------------------
  achieved(measure) {
    switch (measure) {
      case 'byHand': case 'projects': case 'bestContract': case 'autoDelivered': case 'dailySets': return this.stats[measure];
      case 'rep': return this.rep;
      case 'fullest': return Math.max(0, ...Object.values(this.stock)) >= this.capacity ? 1 : 0;
      case 'oneTime': return RESEARCH.filter(r => !r.levels && this.level(r.id)).length;
      case 'staff': return Object.keys(this.team).length;
      case 'topLevel': return Math.max(0, ...Object.values(this.team));
      case 'value': return this.summary().valuation;
      // the records and the newer systems
      case 'marketGood': case 'marketTop': case 'rush': case 'trucked': return this.stats[measure];
      case 'metroOpen': return this.metroYards.filter(id => this.econ.areaOpen(id)).length;
      case 'metroBuilt': return this.built(this.metroYards);
      case 'routes': return Object.keys(this.routes).length;
      case 'streakBest': return this.streak.best;
      case 'clientTop': return Math.max(0, ...Object.keys(this.clients).map(name => this.clientLevel(name)));
      case 'peakMinute': return this.records.peakMinute;
      case 'topGood': return Math.max(0, ...Object.values(this.records.goods));
      case 'sales': return this.legacy.sales;
      case 'houseBuilt': return this.site.done.includes('house') ? 1 : 0;
      case 'builds': return this.site.done.length;
      case 'allProfit': {   // the number of open yards, once every one of them earns more than it costs
        const open = this.areas.filter(a => this.econ.areaOpen(a.id));
        return this.age > 60 && open.every(a => this.yardReport(a.id).profit > 0) ? open.length : 0;
      }
      default: return 0;
    }
  }

  /** Costs, share and limit for the pay for time away. */
  offlineTerms() {
    const t = { costs: this.costRate(), cap: this.awayLeft() };
    if (this.mods.offlineShare) t.share = this.mods.offlineShare;
    // The Accountant of the credits store: the share the absence is paid at is higher by its factor. Without one the terms are exactly what they were.
    if (this.mods.awayPay > 1) t.share = (t.share || OFFLINE_EFFICIENCY) * this.mods.awayPay;
    return t;
  }
  /** Time away is paid up to a daily allowance: 4 hours, 6 with Night shift. Seconds of it left today. */
  awayAllowance() { return this.mods.offlineCap || OFFLINE_CAP_SECONDS; }
  awayLeft() { return Math.max(0, this.awayAllowance() - this.away.used); }
  useAway(seconds) { this.away.used += Math.max(0, seconds); }

  // --- selling the company ---------------------------------------------------------------------------
  /** How much more every upgrade costs because of the legacy stars. */
  costScale() { return 1 + PRESTIGE.costPerStar * this.legacy.stars; }
  /** Yards with every upgrade bought (the gate to the next yard does not count). */
  builtYards() { return this.areas.filter(a => this.econ.areaOpen(a.id) && a.upgrades.every(u => this.econ.has(u.id))).length; }
  /** How many of the yards `ids` are open with every upgrade bought. */
  built(ids) { return this.areas.filter(a => ids.includes(a.id) && this.econ.areaOpen(a.id) && a.upgrades.every(u => this.econ.has(u.id))).length; }
  /**
   * The gate "Open the next yard" of the credits store pays: the one out of the newest open yard.
   * { id, yard, from, next, name, cost, due }: the gate's upgrade id, the yard it stands in and that yard's name, the
   * yard behind it and its name, what the gate still costs (a part may be paid), and whether the gate is that yard's
   * next purchase. The game offers a gate only once everything else in its yard is bought, and so does the store: a
   * yard is never opened past one that is not built. null when every yard is open.
   */
  nextGate() {
    const a = this.areas.find(x => x.gate && this.econ.areaOpen(x.id) && !this.econ.areaOpen(x.gate.next)), id = a ? 'gate:' + a.id : '';
    const behind = a && this.areas.find(x => x.id === a.gate.next);
    if (!a || !behind || !this.econ.get(id)) return null;
    return { id, yard: a.id, from: a.name, next: behind.id, name: behind.name, cost: Math.max(0, this.econ.remaining(id)), due: this.econ.nextUpgrade(a.id)?.id === id };
  }
  /** Fully built yards a sale needs: more with every company sold, up to every yard there is. */
  minYards() { return Math.min(this.areas.length, PRESTIGE.minYards + PRESTIGE.minYardsPerSale * this.legacy.sales); }
  /** What a sale would pay right now. A Star bonus of the credits store that waits is in `stars`: it is used by the sale it raises, and by no other. */
  sellOffer() {
    const yards = this.builtYards(), min = this.minYards(), plain = PRESTIGE.stars(yards);
    return { yards, stars: Math.max(plain, Math.floor(plain * flagValue(this, 'starBonus'))), allowed: this.founded && yards >= min, min };
  }
  /**
   * The sale's offer with what the credits store changes about it, for the sale's card and the store's page: `plain` is
   * what the yards alone pay (`stars` is more when a Star bonus waits), and `keeps` is how many upgrades of the first
   * yard the Family yard would keep: 0 when it is not owned, or the server has not said so in this visit.
   */
  sellTerms() {
    const offer = this.sellOffer();
    const keeps = this.mods.familyYard > 0 ? this.areas[0].upgrades.filter(u => this.econ.has(u.id)).length : 0;
    return { ...offer, plain: PRESTIGE.stars(offer.yards), keeps };
  }
  /**
   * What a sale does to the piggy bank of the credits store, for the sale's card: { bank, after }, what it holds now
   * and what it will hold after the sale. A bank holds hours of the income the company is built for, and a new
   * company is built for the first yard's, whatever is kept of that yard (goalRef). While a purchase waits for a full
   * bank (js/sim/store.js, bankDue) also `waits: true`, `full`: where the bank opens for it now, and `small`: where a
   * new company's bank does (a bank cut to that size by the sale is full, and opens at once).
   */
  bankTerms() {
    const bank = bankNow(this), hours = num(itemDoing(this, 'piggy')?.params?.hours), small = Math.floor(FINANCE.baseIncome * 3600 * hours);
    const waits = !!this.store.flags.bankFull && hours > 0;
    return { bank, after: Math.min(bank, small), ...(waits ? { waits, full: bankCap(this), small } : {}) };
  }
  /**
   * Sell the company and found a new one. Yards, cash, routes, warehouse and contracts start over;
   * stars, rank, milestones, achievements, research, managers and reputation stay. Of the credits store's block the
   * season and the card stay as they are (they are the player's month, not a company's), and the piggy bank keeps
   * what a new company's bank can hold.
   * With the Family yard of the credits store, what was bought in the first yard stays bought: its workers, its
   * machines and their speed, the backpack and the better price, each with what was paid for it. The gate out of
   * it is not kept: every other yard starts over.
   * The caller saves and rebuilds the world. @returns the offer that was paid, or null
   */
  sell() {
    const offer = this.sellOffer(), terms = this.sellTerms();
    if (!offer.allowed) return null;
    if (terms.stars > terms.plain) useFlag(this, 'starBonus');   // the Star bonus is used by the sale it raised
    const e = this.econ, kept = terms.keeps ? this.areas[0].upgrades.filter(u => e.has(u.id)).map(u => [u.id, e.paid[u.id]]) : [];
    e.cash = 0; e.unlocked = {}; e.paid = {}; e.areas = [this.areas[0].id]; e.workerRate = 0;
    for (const [id, paid] of kept) { e.unlocked[id] = true; if (paid > 0) e.paid[id] = paid; }
    this.routes = {}; this.stock = {}; this.offers = []; this.active = []; this.readyIds.clear(); this.acc = {};
    this.market.hold = {};   // the market itself goes on: its seed and clock stay, and it waits until the Metropolis is open again
    this.books.clear(); this.shopFlow.clear(); this.trips.clear();
    for (const m of Object.values(this.flow)) m.rate = 0;
    this.legacy.stars += offer.stars; this.legacy.sales++;
    e.scaleCosts(this.costScale());   // the new company is a bigger build
    this.applyMods(); this.refreshCosts(); this.fillOffers();
    this.store.bank = Math.min(num(this.store.bank), bankCap(this));   // the piggy bank holds hours of the new company's income, and no more
    this.rescaleGoals();   // goals priced for the old company would be unreachable, or a fortune, in the new one
    this.sync(true);       // what the sale itself earned (an achievement) is in the save the caller writes next
    return offer;
  }

  // --- the building site (js/data/builds.js) ----------------------------------------------------------------
  /** The site works while every yard is open: it opens with the last gate, and waits after a sale of the company. */
  get siteOpen() { return this.founded && this.econ.areas.length >= SITE.yards; }
  /** A build can ask for this good: it reaches the shops of a finished company. */
  siteGood(item) { return this.siteGoods.has(item); }
  /** The running build's data, or null. */
  build() { return BUILDS.find(b => b.id === this.site.at) || null; }
  siteStage() { const b = this.build(); return b ? b.stages[this.site.stage] : null; }
  /** Every build with where it stands: done, running, ready (it can be started now) or later. */
  buildList() {
    const next = BUILDS[this.site.done.length];
    return BUILDS.map(b => ({ build: b, state: this.site.done.includes(b.id) ? 'done' : b.id === this.site.at ? 'running' : b === next && !this.site.at && this.siteOpen ? 'ready' : 'later' }));
  }
  /** Something on the site waits for the player: a build can be started. The Headquarters button and the tab show a dot. */
  siteFlag() { return this.buildList().some(b => b.state === 'ready'); }
  /** Start the next build. One runs at a time, in the order of the list, and none twice. @returns whether it started */
  startBuild(id) {
    const next = BUILDS[this.site.done.length];
    if (!this.siteOpen || this.site.at || !next || next.id !== id) return false;
    Object.assign(this.site, { at: id, stage: 0, given: {}, value: 0, on: true });
    return true;
  }
  /** What the running stage needs: [{ item, have, need }]. Empty with no build running. */
  siteNeeds() { return (this.siteStage()?.needs || []).map(([item, need]) => ({ item, have: this.site.given[item] || 0, need })); }
  /** How many more of `item` the site takes from the shops right now. */
  siteWants(item) {
    if (!this.site.at || !this.site.on || !this.siteOpen) return 0;
    const need = this.siteStage().needs.find(n => n[0] === item);
    return need ? need[1] - (this.site.given[item] || 0) : 0;
  }
  /** The player's switch: off, every good is sold as usual and what the site has stays. */
  setSiteOn(on) { this.site.on = !!on; }
  /** `n` of a good reach the site. Its value at the normal price is kept, for the least a finished build pays. */
  give(item, n) {
    this.site.given[item] = (this.site.given[item] || 0) + n;
    this.site.value += n * this.econ.price(item);
    this.siteCheck();
  }
  /** A stage with everything it needs is finished and the next begins; the last one finishes the build and pays for it. */
  siteCheck() {
    for (;;) {
      const b = this.build(), stage = this.siteStage();
      if (!b || !stage.needs.every(([item, need]) => (this.site.given[item] || 0) >= need)) return;
      this.site.given = {};
      if (this.site.stage + 1 < b.stages.length) {
        this.events.push({ type: 'stage', build: b, stage, index: this.site.stage });
        this.site.stage++;
        continue;
      }
      // Minutes of the income this company is built for, as it is now; never less than a premium on the goods themselves,
      // so that a stage of costly goods (cars, gift sets) is not a loss.
      const cash = Math.max(b.minutes * 60 * this.goalRef(), SITE.floor * this.site.value);
      this.site.done.push(b.id);
      Object.assign(this.site, { at: null, stage: 0, value: 0 });
      this.earn(cash);
      this.gainXp(b.xp);
      this.events.push({ type: 'built', build: b, stage, cash, xp: b.xp });
    }
  }
  /** How much free warehouse stock the running stage could take now: stock no running contract needs. */
  siteSendable() {
    if (!this.siteOpen) return 0;
    return this.siteNeeds().reduce((sum, g) => sum + Math.max(0, Math.min(g.need - g.have, this.freeStock(g.item))), 0);
  }
  /** Send that stock to the site. @returns how many goods moved */
  sendToSite() {
    if (!this.siteOpen) return 0;
    let moved = 0;
    for (const g of this.siteNeeds()) {
      const n = Math.max(0, Math.min(g.need - g.have, this.freeStock(g.item)));
      if (!n) continue;
      this.stock[g.item] -= n;
      if (this.stock[g.item] <= 0) delete this.stock[g.item];
      this.site.given[g.item] = (this.site.given[g.item] || 0) + n;
      this.site.value += n * this.econ.price(g.item);
      moved += n;
    }
    if (moved) this.siteCheck();
    return moved;
  }
  /**
   * How fast the running stage fills: per good how many reach the shops a minute, and the seconds the stage needs at
   * that pace (its slowest good decides). `none` marks a good that does not reach a shop now; then no time can be given.
   */
  sitePace() {
    const goods = this.siteNeeds().map(g => {
      const perMinute = this.shopRate(g.item) * 60, flowing = perMinute >= SITE.none, left = g.need - g.have;
      // A contract that needs the same good: a rush order takes all of them first, any other shares them one for one.
      const first = left > 0 ? Math.max(0, this.contractsShort(g.item)) : 0, share = !first ? null : this.rushNeeds(g.item) ? 'rush' : 'contract';
      const arrivals = left + (share === 'rush' ? first : Math.min(first, left));   // goods that must reach the shops before the site has its own
      return { ...g, perMinute: flowing ? perMinute : 0, none: left > 0 && !flowing, first, share, seconds: left > 0 && flowing ? arrivals / (perMinute / 60) : null };
    });
    const open = goods.filter(g => g.have < g.need);
    const seconds = !open.length || open.some(g => g.none) ? null : Math.max(...open.map(g => g.seconds));
    return { goods, seconds };
  }
  /** How many more of `item` the running contracts still take from the shops. */
  contractsShort(item) { return this.active.length ? Math.min(this.reserved(item), this.room(item)) - (this.stock[item] || 0) : 0; }
  /** A running rush order needs this good: its clock runs, so it is served before the site. */
  rushNeeds(item) { return this.active.some(c => c.limit && c.needs.some(n => n[0] === item)); }

  // --- the company's name, its records and the Advisor ------------------------------------------------------
  /** Name the company. @returns the name as it was kept, '' for none */
  rename(text) { this.name = cleanName(text); return this.name; }
  /** The lifetime figures, for the Records tab. goods: every good ever brought to a shop, the most first, with its share of them all. */
  recordBook() {
    const counted = Object.values(this.records.goods).reduce((a, b) => a + b, 0);
    const goods = Object.entries(this.records.goods).map(([item, count]) => ({ item, count, share: counted ? count / counted : 0 })).sort((a, b) => b.count - a.count);
    return { sold: this.stats.sold, counted, goods, peakMinute: this.records.peakMinute, bestContract: this.stats.bestContract, played: this.records.played,
      companiesSold: this.legacy.sales, contracts: this.stats.contracts, rush: this.stats.rush, rushLate: this.stats.rushLate,
      marketSold: this.stats.marketSold, marketGood: this.stats.marketGood, bestStreak: this.streak.best, partial: this.records.partial };
  }
  /**
   * What the Advisor needs to know about one yard (see advise() in js/sim/advice.js): its books, what its
   * machines did in the last minute, and which of the usual remedies are still open to the player.
   * @param watched { starved, blocked, missing, seconds } from a YardWatch, or nothing while it has not been watched yet
   */
  yardFacts(id, watched = null) {
    const area = this.areas.find(a => a.id === id), r = this.yardReport(id), w = watched || { starved: 0, blocked: 0, missing: null, seconds: 0 };
    const open = d => !this.routes[d.id] && !this.routeState(d).lock;
    const routeIn = w.missing ? this.routeDefs.find(d => d.to === id && d.item === w.missing) || null : null;
    const can = rid => { const def = RESEARCH.find(x => x.id === rid), st = this.researchState(def); return !st.done && !st.lock && !this.tabLock('research'); };
    return {
      id, name: area.name, age: this.age, income: r.income, costs: r.total, profit: r.profit, biggest: r.biggest, workers: r.workers, machines: r.machines,
      starved: w.starved, blocked: w.blocked, watched: w.seconds,
      missing: w.missing, missingLabel: w.missing ? this.items[w.missing].label : null,
      // the route that would bring the missing material: null when there is none (a raw material of the yard itself)
      // grows: the yard it comes from still has upgrades to buy, so it can be made to send more
      routeIn: routeIn && { from: this.areas.find(a => a.id === routeIn.from).name, owned: !!this.routes[routeIn.id], buyable: open(routeIn),
        grows: this.areas.find(a => a.id === routeIn.from).upgrades.some(u => !this.econ.has(u.id)) },
      routeOut: this.routeDefs.some(d => d.from === id && open(d)),
      canHire: area.upgrades.some(u => u.effect.type === 'worker' && !this.econ.has(u.id)),
      payroll: can('payroll'), efficient: can('efficient'), training: can('training'),
    };
  }
}
