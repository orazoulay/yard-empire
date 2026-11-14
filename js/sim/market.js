// @ts-check
// Pure market rules: what the goods of a market location sell for, as a share of their normal price.
// No rendering and no browser APIs here; the numbers are in MARKET (js/data/company.js).
//
// A price is a function of three things only: the market's seed, the good, and how long the market
// has been played. Nothing is rolled when the game loads and nothing follows the device's clock, so
// reloading a save or changing the date cannot produce a better price, and the same save always
// shows the same history. That is also what makes the rules testable.
//
// The shape: every step the level of a good takes a random step and is pulled part of the way back
// to zero (the normal price), which is a mean-reverting walk. It is worked out from the last
// `memory` random steps instead of being carried along, so no state has to be saved but the time.
import { MARKET } from '../data/company.js';

export const MARKET_MIN = 1 - MARKET.band;   // the lowest and the highest a price can be, times normal
export const MARKET_MAX = 1 + MARKET.band;

/** Scramble a whole number into another one (the finishing step of MurmurHash3). */
function mix(a) {
  a ^= a >>> 16; a = Math.imul(a, 0x85ebca6b);
  a ^= a >>> 13; a = Math.imul(a, 0xc2b2ae35);
  return (a ^ (a >>> 16)) >>> 0;
}
/** A whole number for the name of a good, so every good has its own price history. */
function keyOf(item) {
  let h = 0x811c9dc5;
  for (let i = 0; i < item.length; i++) h = Math.imul(h ^ item.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
/** The random step of one good at one step of one market: a repeatable number from -1 to 1. */
const shock = (seed, key, step) => mix(mix((seed ^ key) >>> 0) + Math.imul(step, 0x9e3779b1)) / 2147483648 - 1;

// How much of a random step is left after 0, 1, 2, ... steps.
const FADE = Array.from({ length: MARKET.memory }, (_, j) => Math.pow(1 - MARKET.pull, j));

/** Which price step the market is in after `t` seconds of play. */
export const stepAt = t => Math.floor(Math.max(0, Number(t) || 0) / MARKET.step);

/**
 * Where the price of `item` stands at `step`, from -1 (the bottom of the band) to 1 (the top); 0 is normal.
 * Steps before 0 exist too: the market was trading before the company arrived.
 */
export function levelAt(seed, item, step) {
  const key = keyOf(String(item));
  let level = 0;
  for (let j = 0; j < MARKET.memory; j++) level += FADE[j] * MARKET.swing * shock(seed, key, step - j);
  return Math.max(-1, Math.min(1, level));
}
/** What `item` sells for at `step`, as a multiple of its normal price: always from MARKET_MIN to MARKET_MAX. */
export const factorAt = (seed, item, step) => 1 + MARKET.band * levelAt(seed, item, step);

const count = (v, top) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Number(v), top) : 0);

/** The market of one company: which goods are traded, its seed, its clock, and which goods the player keeps back. */
export class Market {
  /**
   * @param goods  ids of the goods traded here, read from the yard data by the Company
   * @param saved  the `market` part of a company save, or null (a save from before the market, or a market not opened yet)
   */
  constructor(goods = [], saved = null) {
    const s = saved && typeof saved === 'object' ? saved : null;
    this.goods = [...goods];
    this.seed = Math.floor(count(s?.seed, 4294967295));   // 0 = the market has not opened yet
    this.t = count(s?.t, 1e9);                             // seconds of play since it opened
    this.hold = {};                                        // good -> true: keep it in the warehouse instead of selling it
    for (const g of this.goods) if (s?.hold && s.hold[g]) this.hold[g] = true;
    this.alert = {};                                       // good -> true: tell the player when its price is high
    for (const g of this.goods) if (s?.alert && s.alert[g]) this.alert[g] = true;
    this.cache = { step: -1, factors: {} };
  }
  toJSON() { return { seed: this.seed, t: Math.floor(this.t), hold: this.hold, ...(Object.keys(this.alert).length ? { alert: this.alert } : {}) }; }

  get open() { return this.seed > 0; }
  /** Open the market with a seed. A market that is open keeps the seed it has. */
  start(seed) { if (!this.open) this.seed = (Math.floor(Math.abs(Number(seed) || 0)) % 4294967295) + 1; }
  /** Play time passes. The market stands still while nobody plays. */
  tick(dt) { if (this.open && dt > 0) this.t += dt; }

  trades(item) { return this.goods.includes(item); }
  get step() { return stepAt(this.t); }
  /** Seconds of play until the next prices. */
  get nextIn() { return MARKET.step - (this.t % MARKET.step); }
  /** What `item` sells for now, as a multiple of its normal price; 1 for anything not traded here. */
  factor(item) {
    if (!this.open || !this.trades(item)) return 1;
    const step = this.step;
    if (this.cache.step !== step) this.cache = { step, factors: {} };   // prices change once a step, sales happen many times a second
    return (this.cache.factors[item] ??= factorAt(this.seed, item, step));
  }
  /** The price after this one, as a multiple of the normal price. It is already decided: a price depends only on the seed and the step. */
  nextFactor(item) { return this.open && this.trades(item) ? factorAt(this.seed, item, this.step + 1) : 1; }
  /** True in the step in which the price of `item` came up to `level` times normal or past it: the start of a high stretch, not every step of it. */
  rose(item, level) {
    if (!this.open || !this.trades(item)) return false;
    const step = this.step;
    return factorAt(this.seed, item, step) >= level && factorAt(this.seed, item, step - 1) < level;
  }
  /** What every good sold for at `step`, as multiples of the normal price: { good: factor }. */
  factorsAt(step) { return Object.fromEntries(this.goods.map(g => [g, this.open ? factorAt(this.seed, g, step) : 1])); }
  /** The last `n` prices of `item` since the market opened, oldest first: [{ step, factor }]. */
  history(item, n = MARKET.history) {
    if (!this.open || !this.trades(item)) return [];
    const now = this.step, out = [];
    for (let step = Math.max(0, now - n + 1); step <= now; step++) out.push({ step, factor: factorAt(this.seed, item, step) });
    return out;
  }
}
