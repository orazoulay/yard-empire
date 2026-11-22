// What the Headquarters screen works out before it draws: what is remembered, orderings, estimates and wording.
// Pure: plain numbers and lists in, plain values out. No page and no game objects, so every rule here has a test.
import { OFFLINE_EFFICIENCY, OFFLINE_CAP_SECONDS, shareText } from './offline.js';
import { stateOf, workLeft, pointsOf, STATE_NAMES } from './motivation.js';
import { fmt } from '../format.js';

// --- figures --------------------------------------------------------------------------------
/** True when js/format.js shortens this amount ($5.2M): only then is there an exact figure worth adding. */
export const isShortened = n => Math.floor(Math.abs(n)) >= 10000;
/** A money amount in full, $5,234,567, for the hover text and for a screen reader. */
export function exactMoney(n) {
  const v = Math.floor(Math.abs(n));
  return (n < 0 && v > 0 ? '−$' : '$') + v.toLocaleString('en-US');
}

// --- what the screen remembers between visits ---------------------------------------------------
export const YARD_ORDERS = ['built', 'profit', 'name'];
export const OFFER_ORDERS = ['reward', 'rate', 'time'];
export const RANGES = [120, 600];   // seconds of play a Finance chart can show
/** Whatever was stored, as preferences the screen can trust: unknown values fall back to the defaults. */
export function cleanPrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    tab: typeof p.tab === 'string' && p.tab.length <= 40 ? p.tab : 'overview',
    yards: YARD_ORDERS.includes(p.yards) ? p.yards : 'built',
    losing: p.losing === true,
    offers: OFFER_ORDERS.includes(p.offers) ? p.offers : 'reward',
    range: RANGES.includes(p.range) ? p.range : 600,
    toured: p.toured === true,   // the tour of a new company was shown (or the company needed none)
  };
}
/** The tab to open with: the remembered one, unless it is gone or locked now. `locked(id)` is true for a locked tab. */
export function startTab(saved, ids, locked = () => false) {
  return ids.includes(saved) && !locked(saved) ? saved : ids[0];
}

// --- keyboard ---------------------------------------------------------------------------------
/**
 * The tab a key leads to: up and down step through the list and wrap, 1 to 9 and 0 are the first ten tabs.
 * @returns a tab id, or null when the key means nothing here
 */
export function railKey(key, ids, current) {
  if (/^[0-9]$/.test(key)) return ids[key === '0' ? 9 : Number(key) - 1] ?? null;
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
  const at = Math.max(0, ids.indexOf(current)), n = ids.length;
  return ids[(at + (key === 'ArrowDown' ? 1 : n - 1)) % n];
}

// --- the line of feedback ---------------------------------------------------------------------
/** Messages shown one after another: one is on screen, at most `room` wait, and the oldest waiting one gives way to a newer one. */
export class Line {
  constructor(room = 3) { this.room = room; this.now = null; this.waiting = []; }
  /** @returns the message if it goes on screen right away, or null if it has to wait */
  add(message) {
    if (!this.now) return (this.now = message);
    this.waiting.push(message);
    if (this.waiting.length > this.room) this.waiting.shift();
    return null;
  }
  /** The one on screen has had its time. @returns the next one, or null when the line is empty */
  next() { this.now = this.waiting.shift() || null; return this.now; }
  clear() { this.now = null; this.waiting = []; }
}

// --- yards --------------------------------------------------------------------------------------
/** Yards given in build order, in the order asked for: 'built', 'profit' (best first) or 'name'. */
export function orderYards(rows, order) {
  const out = [...rows];
  if (order === 'profit') out.sort((a, b) => b.profit - a.profit);
  else if (order === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
/**
 * A small trend line in a box w by h: the values spread over the width, and the height spans their
 * range and always zero, so a line under the zero mark is a loss.
 * @returns {{ points: string, zero: number }} polyline points and the height of the zero mark
 */
export function sparkLine(values, w, h, pad = 2) {
  const low = Math.min(0, ...values), high = Math.max(0, ...values), range = high - low || 1;
  const fix = n => Math.round(n * 10) / 10;
  const y = v => fix(pad + (high - v) / range * (h - 2 * pad));
  const step = values.length > 1 ? (w - 2 * pad) / (values.length - 1) : 0;
  return { points: values.map((v, i) => `${fix(pad + i * step)},${y(v)}`).join(' '), zero: y(0) };
}

// --- contracts -----------------------------------------------------------------------------------
/**
 * How long an order still needs at the current pace: its slowest good decides.
 * @param needs [[item, quantity]]
 * @param have  item => how many of it are already in the warehouse for this order
 * @param rate  item => items a second reaching the shops
 * @returns {{ seconds: number, stuck: string|null }} 0 when nothing is missing; Infinity, with the item, when a missing good is not arriving at all
 */
export function fillTime(needs, have, rate, least = 0.001) {
  let seconds = 0, stuck = null;
  for (const [item, qty] of needs) {
    const missing = qty - Math.min(have(item) || 0, qty);
    if (missing <= 0) continue;
    const r = rate(item) || 0;
    if (r <= least) { stuck = stuck || item; seconds = Infinity; } else seconds = Math.max(seconds, missing / r);
  }
  return { seconds, stuck };
}
/** That time in words. The name of the good is not part of it: the caller knows how to say it. */
export function fillText({ seconds, stuck }) {
  if (stuck) return 'nothing is reaching the shop';
  if (seconds <= 0) return 'ready now';
  if (seconds < 60) return 'under a minute';
  const min = Math.ceil(seconds / 60);
  return min < 120 ? `about ${min} min` : `about ${Math.round(min / 60)} h`;
}
/** Offers, each with what it pays (cash) and how long it takes (seconds), ordered by 'reward', 'rate' (reward per minute of waiting) or 'time'. */
export function orderOffers(rows, order) {
  const rate = r => (Number.isFinite(r.seconds) ? r.cash / Math.max(r.seconds, 1) : 0);
  const by = { reward: (a, b) => b.cash - a.cash, rate: (a, b) => rate(b) - rate(a), time: (a, b) => (a.seconds === b.seconds ? 0 : a.seconds - b.seconds) }[order];
  return by ? [...rows].sort(by) : [...rows];
}

// --- research -------------------------------------------------------------------------------------
const signed = factor => {
  const pct = (factor - 1) * 100, size = Math.abs(pct);
  return (pct < 0 ? '−' : '+') + (size >= 10 || Math.abs(size - Math.round(size)) < 0.05 ? Math.round(size) : size.toFixed(1)) + '%';
};
/**
 * What is in force for the whole company, from its modifiers (js/sim/company.js, applyMods): one row per
 * figure that differs from a company with no research, managers, stars or event. Nothing is worked out
 * again here: the factors are the ones the rules use.
 * @param mods      the company's modifiers
 * @param capacity  what the warehouse holds of each item now
 * @param slots     how many contracts can run at once now
 */
export function modRows(mods, { capacity, slots }) {
  const rows = [], off = f => Math.abs(f - 1) > 1e-9;
  // The workers' pace (worker motivation) is folded into the machines and the walk, and the trucks keep it too
  // (Company.runRoutes); it has a row of its own, and the rows of the machines, the walk and the trucks show what is left,
  // so keen workers read as one tenth faster once and not four times.
  const pace = mods.pace || 1, speed = mods.speed / pace, walk = mods.workerSpeed / pace;
  if (off(pace)) rows.push(["Workers' motivation", signed(pace)]);
  if (off(speed)) rows.push(['Machine speed', signed(speed)]);
  if (off(walk)) rows.push(['Workers walk', signed(walk)]);
  if (off(mods.price)) rows.push(['Selling prices', signed(mods.price)]);
  if (off(mods.contractPay)) rows.push(['Contract pay', signed(mods.contractPay)]);
  if (off(mods.wage)) rows.push(['Wages and salaries', signed(mods.wage)]);
  if (off(mods.upkeep)) rows.push(['Machine upkeep', signed(mods.upkeep)]);
  if (off(mods.storage)) rows.push(['Warehouse', `${capacity} of each item`]);
  if (off(mods.hold)) rows.push(["Ships' holds", signed(mods.hold)]);
  if (off(mods.voyage)) rows.push(['Voyages', signed(mods.voyage)]);
  if (mods.premium > 0) rows.push(['Export premium', `+${Math.round(mods.premium * 100)} points`]);
  if (mods.contractSlots > 0) rows.push(['Contracts at once', String(slots)]);
  if (mods.routes) rows.push(['Truck routes', off(mods.routeRate) ? `open, loads ${signed(mods.routeRate)}` : 'open']);
  if (mods.offlineShare || mods.offlineCap || mods.awayPay > 1) {
    // the Accountant of the credits store multiplies the share, as the absence is paid (js/sim/company.js, offlineTerms)
    const share = (mods.offlineShare || OFFLINE_EFFICIENCY) * (mods.awayPay > 1 ? mods.awayPay : 1), cap = mods.offlineCap || OFFLINE_CAP_SECONDS;
    rows.push(['Time away', `${shareText(share)} for up to ${Math.round(cap / 360) / 10} h a day`]);
  }
  return rows.map(([name, value]) => ({ name, value }));
}

// --- worker motivation (js/sim/motivation.js, and "worker motivation" in js/sim/company.js) ---------------------------
/**
 * Everything the Workers' Park card and the chip in the top bar show, or null while the meter does not run.
 * level: whole points; pace: a percent; held, left: seconds of work; next: the state the workers come to after `left`.
 * @returns {null | { level, state, stateName, pace, held, left, next, line, activities: { id, name, price, can, runs, does }[] }}
 */
export function parkView(company) {
  if (!company.motivationOn) return null;
  const m = company.motivation, level = pointsOf(m.level), state = stateOf(m.level), pace = Math.round(company.mods.pace * 100);
  const mins = s => Math.max(1, Math.round(s / 60)), left = workLeft(m), held = Math.max(0, m.hold);
  const next = level <= 0 ? null : state === 'keen' ? 'steady' : state === 'steady' ? 'worn' : 'empty';
  const line = held > 0 ? `Held full for ${mins(held)} more min of work.`
    : state === 'keen' ? `About ${mins(left)} min of work until the workers are no longer keen.`
      : state === 'steady' ? `About ${mins(left)} min of work until the workers are worn out and slow down.`
        : level > 0 ? `The workers are worn out: they work at ${pace}% of their pace. About ${mins(left)} min of work until they are at half.`
          : 'The workers are worn out: they work at half their pace until something is held for them.';
  const activities = company.activities().map(a => ({
    id: a.id, name: a.name, price: a.price, can: a.can, runs: a.runs,
    does: !a.runs ? (held > 0 ? 'Nothing wears while the festival holds' : 'The meter is full')
      : a.leaves.hold > 0 ? `Fills the meter and holds it full for ${mins(a.leaves.hold)} min of work${held > 0 ? ' from now' : ''}`   // only a festival leaves a hold, as soon as it can run (also while its own hold is full)
        : `+${pointsOf(a.leaves.level) - level} · leaves the meter at ${pointsOf(a.leaves.level)}, ${STATE_NAMES[a.state]}`,
  }));
  return { level, state, stateName: STATE_NAMES[state], pace, held, left, next, line, activities };
}
/**
 * Where the marker of the park's meter stands, as a CSS length from the bar's left inner edge: the bar is three zones
 * (worn out 0 to 49, steady 50 to 79, keen 80 to 100, on 50%, 30% and 20% of it), and each whole point is placed inside
 * its own zone, clear of the lines between the zones and of the rounded ends. The marker is 6px wide; a line is 2px.
 */
export function meterAt(level) {
  const p = pointsOf(level);   // the figure the card shows beside it
  // each zone: from its first point to its last, the percent and the pixels at the two ends
  const [from, to, pct0, pct1, px0, px1] = p < 50 ? [0, 49, 0, 50, 7, -4] : p < 80 ? [50, 79, 50, 80, 5, -5] : [80, 100, 80, 100, 4, -7];
  const f = (p - from) / (to - from), r = n => Math.round(n * 100) / 100;
  return `calc(${r(pct0 + (pct1 - pct0) * f)}% + ${r(px0 + (px1 - px0) * f)}px)`;
}
/**
 * The Advisor's line while the workers are worn out: the cheapest activity the cash covers, or, when it covers none, the
 * cheapest that runs and that the cash is short of. Null while they are not worn out. @param v  parkView(company)
 */
export function parkAdvice(v) {
  if (v?.state !== 'worn') return null;
  const paid = v.activities.find(a => a.can), cheapest = paid || v.activities.find(a => a.runs);
  if (!cheapest) return null;
  return { problem: `The workers are worn out: every yard works at ${v.pace}% of its pace.`,
    fix: paid ? `Hold the ${cheapest.name} at the Workers' Park for $${fmt(cheapest.price)}.` : `The ${cheapest.name} at the Workers' Park costs $${fmt(cheapest.price)}; you have less.`,
    go: 'construction' };
}

/** Names in a sentence: "chairs", "chairs and glass", "bricks, chairs and glass". */
export function andList(names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1); }

// --- a running build comes first (Company.routeHeld) ----------------------------------------------------
// While a stage of the building site asks for a good, the trucks leave it at the shops, whichever yard they go to. The
// player's switch for the site is then the choice "build now, or let the trucks run", and every screen that shows a
// held route or a yard standing still for it says so, and names the switch.
export const LET_RUN = 'Switch off Deliveries to the site to let the trucks run.';
/** The Construction tab: the goods the trucks leave for this stage, and the yards that stand still meanwhile. */
export const siteHoldText = (goods, yards) => `The trucks leave the ${andList(goods)} for this stage. Standing still until it has them: ${yards.join(', ')}. ${LET_RUN}`;
/** The Port tab, when a good it waits for is made by a yard that stands still for the site (products: their names). */
export const portHoldText = (products, goods) => {
  const what = andList(products);
  return `${what[0].toUpperCase() + what.slice(1)} are not being made: the building site takes the ${andList(goods)} first. Switch off Deliveries to the site, on the Construction tab, to let the trucks run.`;
};

// --- truck routes -----------------------------------------------------------------------------------
/** The routes that can be bought together with the cash on hand, cheapest first so that it is as many as possible, and their price. */
export function routesWithin(routes, cash) {
  const list = [];
  let total = 0;
  for (const r of [...routes].sort((a, b) => a.cost - b.cost)) {
    if (total + r.cost > cash) break;
    list.push(r); total += r.cost;
  }
  return { list, total };
}

// --- finance -----------------------------------------------------------------------------------------
/** The samples of the last `seconds` of a history (each has its play time as t). */
export function lastSeconds(points, seconds) {
  if (!points.length) return points;
  const from = points[points.length - 1].t - seconds - 1e-6;
  return points.filter(p => p.t >= from);
}
/** At most `max` samples at even steps, always with the newest: enough for a table a person can read. */
export function thin(points, max = 11) {
  if (points.length <= max) return [...points];
  const step = Math.ceil((points.length - 1) / (max - 1)), out = [];
  for (let i = points.length - 1; i >= 0; i -= step) out.unshift(points[i]);
  return out;
}
/**
 * Where the cash comes from: each yard's own sales, and whatever else came in (deliveries, goods sold from
 * the warehouse) as one more row with other: true. Largest first, each with its share of the whole.
 * @param yards   [{ name, sales }] in dollars a second
 * @param income  everything the company took in, dollars a second
 */
export function incomeRows(yards, income) {
  const sold = yards.reduce((sum, y) => sum + Math.max(0, y.sales), 0), rest = Math.max(0, income - sold), total = sold + rest;
  const rows = yards.filter(y => y.sales > 0).map(y => ({ name: y.name, value: y.sales, other: false }));
  if (rest > total * 0.001) rows.push({ name: '', value: rest, other: true });
  for (const r of rows) r.share = total > 0 ? r.value / total : 0;
  return rows.sort((a, b) => b.value - a.value);
}

// --- time in words --------------------------------------------------------------------------------------
/** A time still to wait, counted in minutes: "2 days 5 h", "5 h 12 min", "12 min", "under a minute". */
export function countdown(ms) {
  if (!(ms > 60000)) return 'under a minute';
  const all = Math.ceil(ms / 60000), d = Math.floor(all / 1440), h = Math.floor(all % 1440 / 60), m = all % 60;
  if (d) return `${d} day${d === 1 ? '' : 's'}${h ? ` ${h} h` : ''}`;
  if (h) return `${h} h${m ? ` ${m} min` : ''}`;
  return `${m} min`;
}
/** How old a list is, in steps coarse enough not to tick every second: "just now", "15 seconds ago", "2 min ago". */
export function sinceText(seconds) {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${Math.floor(seconds / 5) * 5} seconds ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

/**
 * The profit as a share of the income, for the Finance tab: "42% of income". Nothing when nothing came in. When the
 * costs are many times the income (a company that just started over still pays the minute before), words: a share of
 * millions of percent is no figure to read.
 */
export function profitShare(profit, income) {
  if (!(income > 0.001)) return '';
  const pct = Math.round(profit / income * 100);
  return pct < -999 ? 'costs are far above income' : `${pct}% of income`;
}

/**
 * The figures beside a chart's lines, top down, without one that reads the same as the one above it: on a flat
 * chart the middle line's "$0.5" is written "$1", like the top line's.
 * @param marks  the values of the lines, top down  @param show  how a value is written
 */
export function axisMarks(marks, show) { return marks.filter((v, i) => i === 0 || show(v) !== show(marks[i - 1])); }
