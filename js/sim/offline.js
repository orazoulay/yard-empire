// @ts-check
// Pure offline-earnings logic: measure what the workers earn per second while the game runs,
// then pay a share of that, after the company's wages and upkeep, for the time the player was away.
// "Away" is any time the game's screen is not shown: the game closed, its tab or window hidden, the app in the
// background. A page that is not drawn runs no rules, so that time is paid on return at this share and no more;
// frames that still arrive while the page is hidden run the rules at the same pace (js/game/loop.js).

export const OFFLINE_CAP_SECONDS = 4 * 3600;   // at most 4 hours are paid
export const OFFLINE_EFFICIENCY = 0.05;        // out of sight the workers slow right down: 5% of their speed (the owner's figure, 20 November 2026; it was a half)
export const OFFLINE_MIN_SECONDS = 60;         // shorter absences are ignored

/** Smoothed dollars-per-second of worker sales (exponential moving average, ~45 s memory). */
export class RateMeter {
  constructor(initialRate = 0, tau = 45) {
    this.rate = Number.isFinite(initialRate) && initialRate > 0 ? initialRate : 0;
    this.tau = tau;
    this.acc = 0;
  }
  add(amount) { this.acc += amount; }
  tick(dt) {
    if (dt <= 0) return;
    const inst = this.acc / dt;
    this.acc = 0;
    this.rate += (inst - this.rate) * (1 - Math.exp(-dt / this.tau));
    if (this.rate < 0) this.rate = 0;
  }
}

/**
 * The seconds of an absence that count: the time away, at most `cap` (what is left of the day's allowance), and none
 * for an absence under a minute. Pay for time away and a ship at sea are both moved by these seconds, times the share.
 * (offlineEarnings keeps its own arithmetic on the unrounded seconds, so that its pay stays exactly what it was.)
 */
export function awaySeconds({ lastSeen, now, cap = OFFLINE_CAP_SECONDS }) {
  if (!lastSeen || !(cap > 0)) return 0;
  const away = (now - lastSeen) / 1000;
  return away >= OFFLINE_MIN_SECONDS ? Math.floor(Math.min(away, cap)) : 0;
}

/**
 * @param {{ rate: number, lastSeen: number, now: number, costs?: number, share?: number, cap?: number }} o
 *   rate and costs in $/s, timestamps in ms; share and cap default to the constants above (research raises them)
 * @returns {{ earned: number, seconds: number, capped: boolean }}
 */
export function offlineEarnings({ rate, lastSeen, now, costs = 0, share = OFFLINE_EFFICIENCY, cap = OFFLINE_CAP_SECONDS }) {
  const none = { earned: 0, seconds: 0, capped: false };
  const net = rate - Math.max(0, costs);
  if (!lastSeen || !(net > 0) || !(cap > 0)) return none;
  const away = (now - lastSeen) / 1000;
  if (!(away >= OFFLINE_MIN_SECONDS)) return none;
  const seconds = Math.min(away, cap);
  return { earned: Math.floor(net * seconds * share), seconds: Math.floor(seconds), capped: away > cap };
}

/** A share of the workers' pace as a percentage: 5%, 7.5%, 60%. One decimal at most, so that a small share still shows what an Accountant adds. */
export function shareText(share) {
  return +(share * 100).toFixed(1) + '%';
}

export function formatAway(seconds) {
  const m = Math.floor(seconds / 60), h = Math.floor(m / 60), rest = m % 60;
  if (h === 0) return m + ' min';
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
