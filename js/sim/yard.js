// Pure rules for how the yard looks alive: who steps aside, how a truck slows, how goods lie on a
// pallet, what sets one machine apart from another, where things stand along a fence, how the camera
// zooms, how the ground dries, when it thunders. None of it changes what is earned; it has no
// rendering in it, so every rule here has a test.

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ------------------------------------------------------------------ people keep apart
const SIDE = 0.45;   // how much of a push goes sideways: two who meet head on pass each other instead of butting heads

/**
 * Work out how far each body should step away from the others it overlaps.
 * Writes `dx` and `dz` on every body. A `fixed` body pushes and is not pushed (the player).
 * @param bodies   [{ pos: { x, z }, fixed? }]
 * @param radius   bodies closer than this push each other
 * @param maxStep  the most anyone is moved by one call. Keep it well under a walking step and
 *                 nobody is ever held back from the spot they are walking to.
 */
export function pushApart(bodies, radius = 0.95, maxStep = Infinity) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) { bodies[i].dx = 0; bodies[i].dz = 0; }
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      if (a.fixed && b.fixed) continue;
      let ox = a.pos.x - b.pos.x; if (ox >= radius || ox <= -radius) continue;
      let oz = a.pos.z - b.pos.z; if (oz >= radius || oz <= -radius) continue;
      const d = Math.hypot(ox, oz);
      if (d >= radius) continue;
      if (d < 1e-4) { const turn = (i * 7 + j * 13) * 2.399963; ox = Math.cos(turn); oz = Math.sin(turn); }   // on the very same spot: any way out will do, as long as it is always the same one
      else { ox /= d; oz /= d; }
      const over = (radius - d) * (a.fixed || b.fixed ? 1 : 0.5);
      const px = (ox - oz * SIDE) * over, pz = (oz + ox * SIDE) * over;
      if (!a.fixed) { a.dx += px; a.dz += pz; }
      if (!b.fixed) { b.dx -= px; b.dz -= pz; }
    }
  }
  if (maxStep === Infinity) return;
  for (let i = 0; i < n; i++) {
    const b = bodies[i], len = Math.hypot(b.dx, b.dz);
    if (len > maxStep) { b.dx *= maxStep / len; b.dz *= maxStep / len; }
  }
}

// ------------------------------------------------------------------ a way around what stands in between
/**
 * The whole way from a to b as a list of points. `route(a, b)` knows how to get around the one thing
 * that stands in the way (it is the game's own, see route in js/main.js): it gives back a, the corners
 * to go by, and b. A stretch to such a corner may have something else standing in it, so every stretch
 * is asked about again, until all of them are clear.
 * @param depth  how many times a stretch may be split before it is taken as it is
 */
export function wayAround(route, a, b, depth = 4) {
  const r = depth > 0 ? route(a, b) : null;
  if (!r || r.length <= 2) return [a, b];
  const out = [a];
  for (let i = 1; i < r.length; i++) {
    const part = wayAround(route, r[i - 1], r[i], depth - 1);
    for (let k = 1; k < part.length; k++) out.push(part[k]);
  }
  return out;
}

// ------------------------------------------------------------------ trucks
/** How sharp the bend between two directions (unit vectors) is: 0 straight on, 1 a right angle or more. */
export function bend(ax, az, bx, bz) { return clamp(1 - (ax * bx + az * bz), 0, 1); }

/**
 * How fast to drive, as a share of full speed, `dist` away from a bend or a stop.
 * @param sharp  0 = nothing to slow for, 1 = a stop or a right angle
 * @param room   how far before it the slowing starts
 * @param crawl  the share of full speed at a stop itself: above zero, so the truck arrives
 */
export function pace(dist, sharp, room = 3.5, crawl = 0.22) {
  const k = clamp(dist / room, 0, 1);
  return 1 - clamp(sharp, 0, 1) * (1 - crawl) * (1 - k);
}

// ------------------------------------------------------------------ goods on a pallet
/**
 * Where item number `i` of a stack on a pad lies. Two to a layer, and every other layer is turned a
 * quarter: that is how planks, sacks and boxes are stacked so the pile holds together.
 * @returns {{ x, y, z, turn }}  turn = rotation around the upright axis
 */
export function padSlot(i, step, spread) {
  const layer = Math.floor(i / 2), side = (i % 2 ? 0.5 : -0.5) * spread, across = layer % 2 === 1;
  return { x: across ? side : 0, y: layer * step, z: across ? 0 : side, turn: (across ? Math.PI / 2 : 0) + (i % 2) * 0.08 };
}

// ------------------------------------------------------------------ machines of different trades
const LOOSE = ['rock', 'gem'];   // shapes of things that are shovelled, not stacked
const TRIM = { metal: 'chimney', gold: 'fine', gem: 'fine', glass: 'fine', barrel: 'drums', plastic: 'vent' };

/**
 * What sets a machine apart from the others that share its model, chosen from its recipe:
 *   sign    colour of what it makes (every machine shows its product)
 *   hopper  colour of its material, when that is loose (stone, sand, ore): it is tipped in from above
 *   trim    by what the product is made of: 'chimney' for metal, 'fine' for gold, gems and glass,
 *           'drums' for barrels, 'vent' for plastics, or null
 *   twin    colour of the second material, when the recipe has one: a second feed on the side
 *   neon    true in the Metropolis, where the factories are lit signs as much as machines
 * @param items     the ITEMS table
 * @param location  'town', 'city' or 'metropolis'
 */
export function machineTraits(recipe, items, location = 'town') {
  const mesh = id => items[id]?.mesh || {};
  const out = mesh(recipe.output), input = mesh(recipe.input);
  return {
    sign: out.color ?? 0xffffff,
    hopper: LOOSE.includes(input.shape) ? input.color ?? 0x9aa0a6 : null,
    trim: TRIM[out.finish] || null,
    twin: recipe.input2 ? mesh(recipe.input2).color ?? 0xffffff : null,
    neon: location === 'metropolis',
  };
}

// ------------------------------------------------------------------ things along a fence
/**
 * Spots for things that stand against the inside of a yard's fence, where nobody walks: people keep
 * 0.8 from the fence, so anything within that strip is out of the way.
 * @param bounds  { minX, maxX, minZ, maxZ } of the yard
 * @param gaps    stretches of fence to keep clear: [{ side: 'n'|'s'|'w'|'e', at, half }] (`at` along the fence)
 * @param count   how many spots to try for; fewer come back when gaps are in the way
 * @param rnd     a function giving 0..1
 * @param inset   how far inside the fence line the spots lie
 * @returns [{ x, z, side, turn }]  turn faces into the yard
 */
export function fenceSpots(bounds, gaps, count, rnd, inset = 0.5) {
  const b = bounds, w = b.maxX - b.minX, d = b.maxZ - b.minZ, corner = 1.6;
  const sides = [
    { side: 'n', len: w, at: t => ({ x: b.minX + t, z: b.minZ + inset }), along: t => b.minX + t, turn: 0 },
    { side: 'e', len: d, at: t => ({ x: b.maxX - inset, z: b.minZ + t }), along: t => b.minZ + t, turn: -Math.PI / 2 },
    { side: 's', len: w, at: t => ({ x: b.maxX - t, z: b.maxZ - inset }), along: t => b.maxX - t, turn: Math.PI },
    { side: 'w', len: d, at: t => ({ x: b.minX + inset, z: b.maxZ - t }), along: t => b.maxZ - t, turn: Math.PI / 2 },
  ];
  const total = 2 * (w + d), out = [];
  for (let i = 0; i < count; i++) {
    let s = (i + 0.15 + rnd() * 0.7) / count * total;   // one to a stretch, so they spread around the yard
    const side = sides.find(q => { if (s < q.len) return true; s -= q.len; return false; }) || sides[3];
    if (s < corner || s > side.len - corner) continue;
    const along = side.along(s);
    if (gaps.some(g => g.side === side.side && Math.abs(along - g.at) < g.half)) continue;
    out.push({ ...side.at(s), side: side.side, turn: side.turn });
  }
  return out;
}

// ------------------------------------------------------------------ worn ground
/**
 * The ways people walk most in a yard, as pairs of points with a weight: from every pile to every
 * machine's feed side, from every machine's finished goods to every shop, and to and from the gates.
 * @param spots  { piles, feeds, goods, shops, gates }: lists of { x, z }
 * @returns [{ a, b, weight }]
 */
export function wearPaths({ piles = [], feeds = [], goods = [], shops = [], gates = [] }) {
  const out = [], add = (a, b, weight) => { if (Math.hypot(a.x - b.x, a.z - b.z) > 0.5) out.push({ a, b, weight }); };
  for (const p of piles) for (const f of feeds) add(p, f, 1);
  for (const g of goods) for (const s of shops) add(g, s, 1);
  // Goods come in and go out through the gates, but not as often as they cross the yard itself.
  for (const gate of gates) {
    for (const f of feeds) add(gate, f, 0.6);
    for (const g of goods) add(g, gate, 0.5);
  }
  return out;
}

// ------------------------------------------------------------------ the camera's zoom
// ------------------------------------------------------------------ what the camera takes in
/**
 * The lens and distance for a screen shape. The camera keeps a fixed sideways view (52°). A tall phone
 * would then see too much sky, so the view is capped at 70° high and the camera pulled back instead.
 * A wide screen (desktop, a phone on its side) used to see only a thin strip of the yard. Below 50° high
 * the camera now pulls back too, as far as a phone stands at most (1.55 times). Whatever is still missing
 * on a very wide screen is made up with a slightly wider lens.
 * @param aspect  width / height of the screen
 * @param zoom    the distance asked for (the player's zoom, the camera's own moves, a reveal)
 * @returns {{ vFov: number, dist: number }}  vFov in degrees; dist multiplies the camera's normal offset
 */
export const FRAME = { h: 52, maxV: 70, minV: 50, maxPull: 1.55 };
export function cameraFrame(aspect, zoom = 1) {
  const rad = d => (d * Math.PI) / 180, deg = r => (r * 180) / Math.PI, half = d => Math.tan(rad(d) / 2);
  let v = deg(2 * Math.atan(half(FRAME.h) / Math.max(aspect, 0.01))), dist = zoom;
  if (v > FRAME.maxV) { dist *= Math.tan(rad(v) / 2) / half(FRAME.maxV); v = FRAME.maxV; }
  else if (v < FRAME.minV) {
    const pull = Math.min(FRAME.maxPull, half(FRAME.minV) / Math.tan(rad(v) / 2));
    dist *= pull;
    v = Math.max(v, deg(2 * Math.atan(half(FRAME.minV) / pull)));   // the rest of the shortfall: a wider lens
  }
  return { vFov: v, dist };
}

export const ZOOM = { min: 0.62, max: 1.5, normal: 1 };   // 1 = the usual distance, below it closer, above it further

/** The player's own zoom: a wish that is set at once and a value that eases toward it. */
export class Zoom {
  constructor() { this.want = ZOOM.normal; this.value = ZOOM.normal; this.from = ZOOM.normal; }
  /** A mouse wheel or a trackpad: a positive delta moves away. */
  wheel(delta) { this.want = clamp(this.want * Math.exp(clamp(delta, -240, 240) * 0.0016), ZOOM.min, ZOOM.max); }
  /** Two fingers went down: remember where the zoom was. */
  pinchStart() { this.from = this.want; }
  /** @param ratio  how far apart the fingers are now, over how far apart they were at the start */
  pinch(ratio) { if (ratio > 0) this.want = clamp(this.from / ratio, ZOOM.min, ZOOM.max); }
  reset() { this.want = ZOOM.normal; }
  step(dt) {
    this.value += (this.want - this.value) * (1 - Math.exp(-dt * 9));
    if (Math.abs(this.want - this.value) < 0.0005) this.value = this.want;
    return this.value;
  }
}

// ------------------------------------------------------------------ weather
/** How wet the ground is, 0..1: it soaks within seconds of rain and takes far longer to dry. */
export function wetness(wet, rain, dt) {
  const target = clamp(rain, 0, 1);
  return clamp(wet + (target - wet) * (1 - Math.exp(-dt / (target > wet ? 6 : 28))), 0, 1);
}

const FLASH = 0.42;   // seconds a stroke of lightning lasts
/** How bright the sky is `age` seconds after a stroke, 0..1: a flash, a flicker after it, then dark. */
export function flashAt(age) {
  if (age < 0 || age >= FLASH) return 0;
  const first = Math.max(0, 1 - age / 0.1), second = age > 0.14 ? Math.max(0, 1 - (age - 0.14) / 0.28) * 0.7 : 0;
  return Math.max(first, second);
}

/**
 * Thunder in a shower: rarely a stroke of lightning, and the rumble a moment later.
 * Only while it really rains, so a shower that is starting or ending is quiet.
 */
export class Storm {
  /** @param rnd  a function giving 0..1 */
  constructor(rnd = Math.random) { this.rnd = rnd; this.next = this.gap(); this.age = Infinity; this.rumbleIn = -1; this.flash = 0; }
  gap() { return 18 + this.rnd() * 50; }   // a shower lasts about a minute: most have one stroke, some none, a few two
  /** @returns true in the one step when the rumble should sound */
  step(dt, rain) {
    this.age += dt;
    if (rain > 0.7 && (this.next -= dt) <= 0) { this.next = this.gap(); this.age = 0; this.rumbleIn = 0.5 + this.rnd() * 1.4; }
    this.flash = flashAt(this.age);
    if (this.rumbleIn < 0) return false;
    this.rumbleIn -= dt;
    if (this.rumbleIn > 0) return false;
    this.rumbleIn = -1;
    return true;
  }
}
