// The small rules of the yard's interface that need no page to run: what a label says, how sales add
// up into one number, how a password is judged, what the save status reads. Tested in tests/yard-interface.test.mjs.
import { fmt, money } from './format.js';

export const cap = text => (text ? text[0].toUpperCase() + text.slice(1) : '');

// --- the loading screen ----------------------------------------------------------------------------
/** Short, true things about the game, one of which is shown while it loads. `keys: true` only makes sense with a keyboard. */
export const TIPS = [
  { text: 'The green arrows on the ground always point at what to do next.' },
  { text: 'Stand on a plot to pay for it. You can pay a part now and the rest later.' },
  { text: 'Workers keep earning while you are away, for a few hours a day.' },
  { text: 'Opening your second yard founds the company and its Headquarters.' },
  { text: 'A contract pays more than selling the same goods in the shop.' },
  { text: 'Tap the yard name at the top to jump to any yard you have opened.' },
  { text: 'Tap the card at the bottom to be shown where to go.' },
  { text: 'The bell at the top keeps a list of what you unlocked since you opened the game.' },
  { text: 'Truck routes carry goods from one yard to the machines of the next.' },
  { text: 'The game saves by itself every few seconds.' },
  { text: 'Press ? in the yard to see the keyboard shortcuts.', keys: true },
];
/** One tip, picked with `random` (0 to 1). Tips about the keyboard are left out on a device without one. */
export function pickTip(random = Math.random(), { keyboard = false } = {}) {
  const pool = TIPS.filter(t => keyboard || !t.keys);
  return pool[Math.max(0, Math.min(pool.length - 1, Math.floor(random * pool.length)))].text;
}

// --- time in words ---------------------------------------------------------------------------------
/** How long ago something happened, for the log: just now, 5 min ago, 2 h 10 min ago. */
export function ago(seconds) {
  if (!(seconds >= 45)) return 'just now';
  const m = Math.max(1, Math.round(seconds / 60)), h = Math.floor(m / 60), rest = m % 60;
  if (h === 0) return `${m} min ago`;
  return rest ? `${h} h ${rest} min ago` : `${h} h ago`;
}
/** How long the player was away, which can be days: 12 min, 3 h 5 min, 2 days 4 h. */
export function awayText(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 1) return 'under a minute';
  if (h === 0) return `${m} min`;
  if (d === 0) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const days = d === 1 ? '1 day' : `${d} days`;
  return h % 24 ? `${days} ${h % 24} h` : days;
}

/**
 * The terms of the pay for time away, as the lines of the welcome-back sheet.
 * @param {{ away: number, seconds: number, capped: boolean, share: number, afterCosts: boolean, left: number, allowance: number }} o
 *   away: seconds really gone; seconds: how many of them were paid; share: 0 to 1 of the workers' rate;
 *   left and allowance: seconds of today's allowance still unused, and its full length
 */
export function awayFacts({ away, seconds, capped, share, afterCosts, left, allowance }) {
  return {
    away: awayText(Math.max(away, seconds)),
    paid: awayText(seconds) + (capped ? ", today's limit" : ''),
    rate: `${Math.round(share * 100)}% of what your workers earn` + (afterCosts ? ', after wages and upkeep' : ''),
    left: left >= 60 ? `${awayText(left)} of ${awayText(allowance)}` : `Nothing: the ${awayText(allowance)} are used up`,
  };
}

// --- the cash pill -----------------------------------------------------------------------------------
/** What the company makes a minute, from a rate per second: +$1.2K/min, −$40/min. tone: 'up', 'down', or '' for nothing either way. */
export function rateText(perSecond) {
  const m = Math.round((Number(perSecond) || 0) * 60);
  return { text: money(m, { plus: true }) + '/min', tone: m > 0 ? 'up' : m < 0 ? 'down' : '' };
}

// --- labels in the yard ------------------------------------------------------------------------------
/** With this share of what is still to pay in hand, a plot says how much is missing. */
export const PLOT_CLOSE = 0.6;
/**
 * The line under a plot's price. Nothing while the price is far away, the missing amount in words when
 * it is close, and what to do once the cash is there.
 * @param {{ cash: number, remaining: number }} o  remaining: what is still to pay for the plot
 */
export function plotNote({ cash, remaining }) {
  if (!(remaining > 0)) return '';
  if (cash >= remaining) return 'Stand here to buy';
  if (cash < remaining * PLOT_CLOSE) return '';
  return `$${fmt(Math.ceil(remaining - cash))} to go`;
}
/** What waits in a machine and what lies ready, for its label: "In 3 · Out 2", or "In 3 + 1 · Out 2" with two materials. */
export function machineCounts(sim) {
  const waiting = sim.two ? `${sim.inputs} + ${sim.inputs2}` : String(sim.inputs);
  return `In ${waiting} · Out ${sim.outputs}`;
}
/** The carry bubble: what is carried, how many, and how full the hands are (0 to 1). */
export function carryText({ label, count, capacity }) {
  const full = count >= capacity;
  return { name: cap(label), count: full ? 'Full' : `${count}/${capacity}`, fill: capacity > 0 ? Math.min(1, count / capacity) : 0, full };
}

// --- numbers that add up -----------------------------------------------------------------------------
/** Sales that follow one another within `window` seconds become one sum, shown as a figure that counts up to it. */
export class Tally {
  constructor(window = 0.9) { this.window = window; this.total = 0; this.shown = 0; this.count = 0; this.last = -Infinity; }
  /** @returns true when the amount joined the running sum, false when it started a new one */
  add(amount, now) {
    const joined = this.count > 0 && now - this.last <= this.window;
    if (!joined) { this.total = 0; this.count = 0; this.shown = amount; }   // a single sale shows its price at once
    this.total += amount; this.count++; this.last = now;
    return joined;
  }
  /** Move the shown figure toward the sum. @returns the figure to show */
  step(dt) {
    const d = this.total - this.shown;
    this.shown = Math.abs(d) < 0.5 ? this.total : this.shown + d * Math.min(1, dt * 12);
    return this.shown;
  }
  get settled() { return this.shown === this.total; }
  /** True once no sale has joined for longer than the window: the number may float away. */
  over(now) { return now - this.last > this.window; }
}

// --- the log -----------------------------------------------------------------------------------------
/** The last announcements since the game was opened, newest first, and how many of them the player has not looked at. */
export class Journal {
  constructor(limit = 30) { this.limit = limit; this.items = []; this.unseen = 0; }
  add(entry, at) {
    this.items.unshift({ ...entry, at });
    if (this.items.length > this.limit) this.items.length = this.limit;
    this.unseen = Math.min(this.limit, this.unseen + 1);
  }
  seen() { this.unseen = 0; }
}

// --- the joystick ------------------------------------------------------------------------------------
/** The middle of the stick where a resting finger does not move the player, as a share of its radius. */
export const STICK_DEAD = 0.14;
/**
 * A finger's offset from where it went down, as a move of length 0 to 1. Inside the dead zone nothing
 * moves; past it the speed grows from zero, so there is no jump at its edge.
 */
export function stick(dx, dy, radius, dead = STICK_DEAD) {
  const raw = Math.hypot(dx, dy) / radius;
  if (!(raw > dead)) return { x: 0, z: 0, len: 0 };
  const len = Math.min(1, (raw - dead) / (1 - dead)), k = len / (raw * radius);
  return { x: dx * k, z: dy * k, len };
}

// --- keyboard shortcuts ------------------------------------------------------------------------------
export const SHORTCUTS = [
  { keys: ['W', 'A', 'S', 'D'], also: 'or the arrow keys', does: 'Move' },
  { keys: ['H'], does: 'Open or close the Headquarters' },
  { keys: ['M'], does: 'Sound and music off or on' },
  { keys: ['?'], does: 'Show this list' },
  { keys: ['Esc'], does: 'Close what is open' },
];
/**
 * What a key press asks for: 'hq', 'mute', 'help', 'close', or null. Never while the player is typing
 * in a field, and never together with Ctrl, Alt or Cmd, which belong to the browser.
 */
export function shortcutFor({ key, ctrlKey, metaKey, altKey }, typing = false) {
  if (typing || ctrlKey || metaKey || altKey || typeof key !== 'string') return null;
  if (key === 'Escape') return 'close';
  if (key === '?') return 'help';
  const k = key.toLowerCase();
  return k === 'h' ? 'hq' : k === 'm' ? 'mute' : null;
}

// --- is the game saved -------------------------------------------------------------------------------
/**
 * What to say about saving. `short` sits in the top bar, `long` in the settings.
 * @param {{ user: boolean, online: boolean, busy: boolean, stored: boolean }} o
 *   stored: this browser keeps what the game writes (a private window may not)
 */
export function saveStatus({ user, online, busy, stored }) {
  if (!stored) return { key: 'unsaved', icon: 'offline', short: 'Not saved', long: 'This browser is not keeping your progress. A private window can do that.' };
  if (!user) return { key: 'device', icon: 'check', short: 'Saved', long: 'Your progress is saved on this device.' };
  if (!online) return { key: 'offline', icon: 'offline', short: 'Offline', long: 'Offline. Your progress is kept on this device and goes to your account when you are back online.' };
  if (busy) return { key: 'saving', icon: 'cloud', short: 'Saving', long: 'Saving to your account.' };
  return { key: 'account', icon: 'cloud', short: 'Saved', long: 'Your progress is saved to your account.' };
}

// --- a new password ----------------------------------------------------------------------------------
export const PASSWORD_MIN = 8;   // what the server asks for; this file only describes, it does not decide
const RUNS = ['abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', '01234567890', '09876543210', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const COMMON = ['password', 'letmein', 'welcome', 'iloveyou', 'yardempire', 'qwerty'];
/**
 * How good a new password is, in plain words. level 0: too short to be accepted, 1: easy to guess,
 * 2: good, 3: strong. Length counts most. A password of one repeated character, a row of keys, a
 * well-known word or the username with a few characters added is easy to guess.
 */
export function passwordStrength(password, username = '') {
  const pw = String(password || ''), n = pw.length;
  if (n === 0) return { level: 0, text: '' };
  if (n < PASSWORD_MIN) return { level: 0, text: `Too short: ${PASSWORD_MIN - n} more ${PASSWORD_MIN - n === 1 ? 'character' : 'characters'}` };
  const low = pw.toLowerCase(), name = String(username || '').toLowerCase();
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(r => r.test(pw)).length;
  const different = new Set(low).size;
  const padded = word => low.includes(word) && n - word.length <= 4;   // the word with a "1" or "2024" stuck on
  const guessable = different <= 3 || RUNS.some(run => run.includes(low)) || COMMON.some(padded) || (name.length >= 3 && padded(name));
  if (guessable) return { level: 1, text: 'Easy to guess' };
  if (kinds === 1 && n < 12) return { level: 1, text: 'Easy to guess: make it longer, or mix letters and numbers' };
  if ((n >= 14 && kinds >= 2) || (n >= 11 && kinds >= 3) || n >= 20) return { level: 3, text: 'Strong' };
  return { level: 2, text: 'Good' };
}
