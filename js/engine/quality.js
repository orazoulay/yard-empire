// @ts-check
// Graphics levels, and the automatic choice between them from how fast this device really draws.
//
// The levels change what costs the most first and keep the picture sharp the longest. Going down a level gives up,
// in this order: the finest shadows and their smallest casters, part of the particles and smoke, the thinner
// undergrowth, rain and passers-by; the screen's resolution is lowered only when the lowest level is still too slow.
// A blurry yard is the last thing a player should see.
//
// Pure logic, no Three.js and no page: tests/quality.test.mjs runs it in Node.

/** The levels from cheapest to richest. 'auto' is not a level: it means "choose one" (AutoQuality below). */
export const LEVELS = ['low', 'balanced', 'high', 'ultra'];

/**
 * What each level draws.
 *   pixelRatio  the most screen pixels per CSS pixel it draws (never more than the device has)
 *   shadowMap   size of the sun's shadow map; shadowEvery: drawn again every n frames (the shadow pass is a second
 *               drawing of every caster); smallShadows: whether small things (goods in a stack) cast one
 *   particles   share of every burst that is drawn; smoke: how much longer between puffs (1 = as designed)
 *   detail      the full undergrowth, rain, splashes and passers-by (false = the thinned set)
 */
export const PROFILES = {
  low:      { name: 'low', pixelRatio: 1.5, shadowMap: 1024, shadowEvery: 2, smallShadows: false, particles: 0.45, smoke: 2.5, detail: false },
  balanced: { name: 'balanced', pixelRatio: 2, shadowMap: 1024, shadowEvery: 2, smallShadows: false, particles: 0.75, smoke: 1.5, detail: true },
  high:     { name: 'high', pixelRatio: 2, shadowMap: 2048, shadowEvery: 1, smallShadows: true, particles: 1, smoke: 1, detail: true },
  ultra:    { name: 'ultra', pixelRatio: 3, shadowMap: 4096, shadowEvery: 1, smallShadows: true, particles: 1, smoke: 1, detail: true },
};

/** The pixel ratio a level draws at on a device with `dpr` pixels per CSS pixel, after `scale` (see AutoQuality). */
export const pixelRatioFor = (profile, dpr, scale = 1) => Math.max(1, Math.min(dpr || 1, profile.pixelRatio) * scale);

const sorted = list => [...list].sort((a, b) => a - b);
const pick = (s, q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];

/**
 * Chooses the level for 'auto' from measured frames, and changes it slowly.
 *   - It starts at `start` (high), and waits `warmup` seconds after starting, after every change and after every
 *     pause: the first frames compile shaders and upload pictures, and are slow on every device.
 *   - Down: when half the frames of two checks in a row took longer than `slowMs` (about 45 frames a second).
 *   - Up: only after `calmFor` seconds in a row of comfortable frames, and never above `start`. A level that had to be
 *     left again soon after it was tried becomes the ceiling for the rest of the visit, so the level does not swing.
 *   - At the lowest level, still too slow and held back by the graphics chip (the script leaves much of the frame
 *     free): the resolution is lowered, a step at a time, to no less than `minScale`. A slow processor keeps the pixels.
 * The time between frames is what is measured (so a device held back by its graphics chip counts too), plus the
 * script time of a frame, which says whether there is room to go back up.
 */
export class AutoQuality {
  constructor({ start = 'high', slowMs = 22, comfortMs = 18.5, roomMs = 7, warmup = 3, cooldown = 5, calmFor = 20, minScale = 0.75, pauseMs = 2500 } = {}) {
    this.start = start; this.level = start; this.scale = 1;
    this.o = { slowMs, comfortMs, roomMs, warmup, cooldown, calmFor, minScale, pauseMs };
    this.gaps = []; this.work = [];
    this.wait = warmup;          // seconds before frames count again
    this.age = 0;                // seconds since the last check
    this.slowChecks = 0; this.calm = 0;
    this.ceiling = start;        // the richest level allowed for the rest of the visit
    this.raisedAt = -Infinity;   // when the level last went up (clock below)
    this.clock = 0;
  }
  /** After a pause (the tab was hidden, a sheet covered the game): the next frames are not a fair measure. */
  rest() { this.wait = Math.max(this.wait, this.o.warmup); this.gaps.length = 0; this.work.length = 0; }
  /**
   * Count one frame. @param gapMs time since the last frame, workMs the script time of this one.
   * @returns a change, { level, scale }, when one was made now, else null
   */
  frame(gapMs, workMs = 0) {
    const sec = gapMs / 1000;
    this.clock += Math.min(sec, 2);
    // A gap of seconds is a pause (a tab that slept, an alert): not counted. A device that takes most of a second for
    // every frame is not paused, it is slow, so a gap is only a pause when it is longer than `pauseMs` (the game itself
    // also calls rest() when the page is hidden or a sheet covers it).
    if (gapMs > this.o.pauseMs) { this.rest(); return null; }
    if (this.wait > 0) { this.wait -= sec; return null; }
    this.gaps.push(gapMs); this.work.push(workMs);
    this.age += sec;
    if (this.age < 1) return null;
    this.age = 0;
    const gaps = sorted(this.gaps), work = sorted(this.work);
    this.gaps.length = 0; this.work.length = 0;
    const median = pick(gaps, 0.5), p90 = pick(gaps, 0.9), workP90 = pick(work, 0.9);
    const o = this.o, i = LEVELS.indexOf(this.level);
    if (median > o.slowMs) {
      this.calm = 0;
      if (++this.slowChecks < 2) return null;
      this.slowChecks = 0;
      if (i > 0) {
        if (this.clock - this.raisedAt < 30) { this.ceiling = LEVELS[i - 1]; this.raisedAt = -Infinity; }   // raised a moment ago and could not hold: it stays down
        return this.change(LEVELS[i - 1], this.scale);
      }
      // Fewer pixels only help a device held back by its graphics chip. When the script fills most of the frame, the
      // processor is what is slow, and a blurrier picture would buy nothing.
      const gpuBound = pick(work, 0.5) < median * 0.6;
      if (gpuBound && this.scale > o.minScale + 1e-6) return this.change(this.level, Math.max(o.minScale, +(this.scale - 0.125).toFixed(3)));
      return null;
    }
    this.slowChecks = 0;
    // comfortable: frames on time, and the script leaves plenty of the frame free
    if (p90 < o.comfortMs && workP90 < o.roomMs) this.calm++; else this.calm = 0;
    if (this.calm < o.calmFor) return null;
    this.calm = 0;
    if (this.scale < 1) return this.change(this.level, Math.min(1, +(this.scale + 0.125).toFixed(3)));
    if (i < LEVELS.indexOf(this.ceiling)) { this.raisedAt = this.clock; return this.change(LEVELS[i + 1], 1); }
    return null;
  }
  change(level, scale) {
    this.level = level; this.scale = scale;
    this.wait = this.o.cooldown; this.calm = 0; this.slowChecks = 0;
    return { level, scale };
  }
}
