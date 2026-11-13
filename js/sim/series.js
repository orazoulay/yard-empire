// A short history of measurements for a chart: one sample per interval, the oldest dropped.
// Pure: it is fed time and a function that reads the values, and knows nothing about the game.

export class Series {
  constructor({ every = 5, keep = 120 } = {}) {
    this.every = every;   // seconds between samples
    this.keep = keep;     // samples kept
    this.points = [];     // oldest first: { t, ...values }
    this.t = 0;           // seconds fed in so far
    this.wait = 0;
  }
  /** Advance by dt seconds. When an interval has passed, store read() and return true. */
  add(dt, read) {
    if (!(dt > 0)) return false;
    this.t += dt; this.wait += dt;
    if (this.wait < this.every) return false;
    this.wait = 0;
    this.points.push({ ...read(), t: this.t });
    if (this.points.length > this.keep) this.points.shift();
    return true;
  }
  get last() { return this.points[this.points.length - 1] || null; }
  /** Seconds between the oldest and the newest sample. */
  get span() { return this.points.length > 1 ? this.last.t - this.points[0].t : 0; }
  /** The sample closest to `seconds` before the newest one; null while the history is shorter than that. */
  ago(seconds) {
    if (this.span < seconds) return null;
    const at = this.last.t - seconds;
    return this.points.reduce((best, p) => (Math.abs(p.t - at) < Math.abs(best.t - at) ? p : best));
  }
  clear() { this.points = []; this.wait = 0; }
}

const STEPS = [1, 1.5, 2, 3, 4, 5, 6, 8, 10];
/** A round ceiling for a chart axis, at or above v: one of the steps above times a power of ten. */
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return STEPS.find(s => m <= s * (1 + 1e-9)) * p;
}
