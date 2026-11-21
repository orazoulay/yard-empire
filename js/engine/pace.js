// @ts-check
// How often the game draws. A phone gets warm from the pictures it draws: each one is a full yard in 3D, and by itself
// the browser asks for one at every refresh of the screen (60 a second, 90 or 120 on newer phones) for as long as the
// game is open. The rules of the game run in steps of their own (js/game/loop.js) and do not care how many pictures
// there are, so drawing fewer costs the player nothing but smoothness:
//   - while somebody plays, every refresh is drawn, as before;
//   - once nobody has touched the game for a minute it rests: half as many pictures, until the next touch;
//   - with the Battery saver of the settings on, 30 pictures a second at most, and 20 while it rests.
//
// A pace is kept by drawing every second (third, fourth...) refresh, so the pictures come evenly; on a screen whose
// refresh does not divide into the pace it draws a little less often, never more.
//
// Pure logic, no page: tests/pace.test.mjs runs it in Node.

/** Pictures a second: with the Battery saver, while resting, while resting with the saver; and the seconds with no touch before a rest. */
export const PACE = { saver: 30, rest: 30, saverRest: 20, restAfter: 60 };

const TOLERANCE = 3;        // ms: a refresh this little ahead of its time is on time (the screen's clock wobbles)
const USUAL = 1000 / 60;    // ms: the gap between pictures the automatic graphics level reads as "in time" (js/engine/quality.js)

export class FramePace {
  /** @param o {{ saver?: boolean }}  saver: the Battery saver of the settings */
  constructor({ saver = false } = {}) {
    this.saver = saver;
    this.awake = false;     // true = never rest (the benchmark, which measures a minute and more without a touch)
    this.touchedAt = 0;     // ms, on the clock of due(): when the player last did something
    this.nextAt = 0;        // ms: no picture before this
    this.gap = 0;           // ms between pictures at the pace of the last due(); 0 = every refresh
  }
  /** The player did something (a finger, a key, the wheel), or is steering. */
  touch(now) { this.touchedAt = now; }
  /** True once nobody has touched the game for PACE.restAfter seconds. */
  resting(now) { return !this.awake && now - this.touchedAt > PACE.restAfter * 1000; }
  /** The pictures a second wanted at `now`; 0 means every refresh of the screen. */
  rate(now) {
    const resting = this.resting(now);
    return this.saver ? (resting ? PACE.saverRest : PACE.saver) : resting ? PACE.rest : 0;
  }
  /** Asked at every refresh of the screen, with its time in ms: true when this one is to be drawn. */
  due(now) {
    const fps = this.rate(now);
    this.gap = fps ? 1000 / fps : 0;
    if (this.gap && now < this.nextAt - TOLERANCE) return false;
    this.nextAt = now + this.gap;   // counted from the picture that was really drawn: nothing is caught up after a pause
    return true;
  }
  /**
   * How much of the time between two pictures is the pace and not the device, in ms. The automatic graphics level
   * takes it off each gap it measures, so a phone that draws in time at 30 a second is not taken for a slow one.
   */
  get slack() { return Math.max(0, this.gap - USUAL); }
  /** For the diagnostics: 'every refresh', '30 a second (battery saver)', '30 a second (resting)'. */
  describe(now) {
    const fps = this.rate(now);
    if (!fps) return 'every refresh';
    return `${fps} a second (${[this.saver ? 'battery saver' : '', this.resting(now) ? 'resting' : ''].filter(Boolean).join(', ')})`;
  }
}
