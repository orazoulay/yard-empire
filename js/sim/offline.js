// Pure offline-earnings logic: measure what the workers earn per second while the game runs,
// then pay a share of that, after the company's wages and upkeep, for the time the player was away.

export const OFFLINE_CAP_SECONDS = 4 * 3600;   // at most 4 hours are paid
export const OFFLINE_EFFICIENCY = 0.5;         // workers run at half speed while nobody watches
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

export function formatAway(seconds) {
  const m = Math.floor(seconds / 60), h = Math.floor(m / 60), rest = m % 60;
  if (h === 0) return m + ' min';
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
