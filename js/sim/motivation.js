// js/sim/motivation.js
// @ts-check
// Worker motivation: the pure rules of the meter. The numbers are MOTIVATION in js/data/builds.js; the company holds
// the state and decides when the meter runs (js/sim/company.js, "worker motivation"). Nothing here reads a clock.
import { MOTIVATION as M } from '../data/builds.js';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const LONGEST_HOLD = Math.max(...M.activities.map(a => a.hold || 0));

export const STATE_NAMES = { keen: 'Keen', steady: 'Steady', worn: 'Worn out' };

/** The meter as a save has it (level in hundredths of a point), kept in range. A missing meter, or one with no level, is full. */
export function readMotivation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { level: 100, hold: 0, rate: 0 };
  const level = typeof raw.level === 'number' && Number.isFinite(raw.level) ? clamp(raw.level / 100, 0, 100) : 100;
  return { level, hold: clamp(Math.floor(num(raw.hold)), 0, LONGEST_HOLD), rate: Math.max(0, num(raw.rate)) };
}

/**
 * The meter in whole points, as the player reads it and as the rules use it: rounded up, so a point is missing only
 * once all of it is gone. A full meter worn by a moment of work still reads 100 and counts as full (no Barbecue is
 * sold for a fraction of a point), and the pace is at half only when the meter is empty. The states and the pace
 * change a hundred times at the most on the way down.
 */
export const pointsOf = level => Math.ceil(clamp(num(level), 0, 100));

export function stateOf(level) { const p = pointsOf(level); return p >= M.keen ? 'keen' : p >= M.worn ? 'steady' : 'worn'; }

/** The factor on the machines' speed and the workers' walking speed. */
export function paceOf(level) {
  const p = pointsOf(level);
  if (p >= M.keen) return M.keenPace;
  if (p >= M.worn) return 1;
  return M.floor + (1 - M.floor) * p / M.worn;
}

/** `seconds` of work pass: a hold is used up first, and the rest wears the meter. Changes and returns `m`. */
export function wear(m, seconds) {
  let s = Math.max(0, num(seconds));
  const held = Math.min(m.hold, s);
  m.hold -= held; s -= held;
  m.level = Math.max(0, m.level - s * 100 / M.life);
  return m;
}

/** An activity that adds points runs only when the meter reads under 100; a festival always can (its hold starts again). */
export function canRun(m, activity) { return !!activity.fills || (m.hold <= 0 && pointsOf(m.level) < 100); }

/** What the meter is after `activity`: `{ level, hold }`. Changes nothing. */
export function after(m, activity) {
  return activity.fills ? { level: 100, hold: activity.hold } : { level: Math.min(100, m.level + activity.adds), hold: m.hold };
}

/** Dollars: the activity's minutes of the measured income (`rate`, a second), and never less than of the reference income. */
export function priceOf(activity, rate, goalRef) {
  return Math.round(activity.minutes * 60 * Math.max(num(rate), num(goalRef)));
}

/**
 * Seconds of work before the workers are one state lower: keen until the meter reads under 80 (at 79), steady until it
 * reads under 50 (at 49), worn out until it is empty.
 */
export function workLeft(m) {
  const state = stateOf(m.level), to = state === 'keen' ? M.keen - 1 : state === 'steady' ? M.worn - 1 : 0;
  return Math.max(0, num(m.hold)) + Math.max(0, m.level - to) * M.life / 100;
}
