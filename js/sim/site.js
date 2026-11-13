// What stands where on the building site and around the city, worked out as plain numbers: no drawing here.
// js/site.js and js/world.js turn these lists into shapes; tests/site.test.mjs checks them without a screen.
import { BUILDS, SITE } from '../data/builds.js';

/** A repeatable run of numbers in [0, 1) for a whole-number seed (mulberry32). The same seed gives the same world. */
export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Does a point lie on a rectangle of ground, with `pad` around it? */
export const onRect = (x, z, r, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;

/** The points of a scattered list ([x, z, ...]) that do not lie on any of the `clear` rectangles. */
export const offRects = (points, clear, pad = 1.5) => (clear.length ? points.filter(p => !clear.some(r => onRect(p[0], p[1], r, pad))) : points);

/**
 * What stands around Industrial City and the Metropolis: asphalt on three sides, low buildings to the south and at
 * the ends, and two striped chimneys. Every building is drawn from the same run of numbers as before the building
 * site existed, and those on a `clear` rectangle are left out afterwards: the others stay exactly where they were.
 * A chimney that would stand in front of a `clear` rectangle moves to the north end of its side.
 * @param rects  the yards the edge goes around
 * @param clear  rectangles of ground to keep free (the building site's plot)
 * @returns {{ slabs: number[][], buildings: {x, z, w, d, h, wall, roof, vx, vz}[], chimneys: number[][] }}
 *   slabs: [x0, x1, z0, z1]; wall, roof: which of five colours; vx, vz: where the vent stands on the roof
 */
export function cityEdge(rects, clear = []) {
  const rnd = mulberry(41);
  const b = { minX: Math.min(...rects.map(r => r.minX)), maxX: Math.max(...rects.map(r => r.maxX)), minZ: Math.min(...rects.map(r => r.minZ)), maxZ: Math.max(...rects.map(r => r.maxZ)) };
  const W = 12;   // width of the asphalt band
  const slabs = [[b.minX - W, b.maxX + W, b.maxZ, b.maxZ + W], [b.minX - W, b.minX, b.minZ, b.maxZ], [b.maxX, b.maxX + W, b.minZ, b.maxZ]];   // south, west, east
  const all = [];
  const building = (x, z, w, d, h) => {
    const wall = Math.floor(rnd() * 5), roof = Math.floor(rnd() * 5);
    all.push({ x, z, w, d, h, wall, roof, vx: x + (rnd() - 0.5) * (w - 1.6), vz: z + (rnd() - 0.5) * (d - 1.6) });
  };
  for (let x = b.minX - 7; x < b.maxX + 8; x += 6.5 + rnd() * 3) building(x, b.maxZ + 6 + rnd() * 3.5, 4 + rnd() * 2, 4 + rnd() * 1.5, 2.6 + rnd() * 3.2);
  for (let z = b.minZ + 4; z < b.maxZ; z += 7 + rnd() * 3) {
    building(b.minX - 6 - rnd() * 3, z, 4 + rnd() * 1.5, 4 + rnd() * 2, 3 + rnd() * 3.5);
    building(b.maxX + 6 + rnd() * 3, z, 4 + rnd() * 1.5, 4 + rnd() * 2, 3 + rnd() * 3.5);
  }
  const stands = (o, r) => o.x + o.w / 2 + 0.4 > r.minX && o.x - o.w / 2 - 0.4 < r.maxX && o.z + o.d / 2 + 0.4 > r.minZ && o.z - o.d / 2 - 0.4 < r.maxZ;
  // A chimney that would stand between the camera and a `clear` rectangle (just south of it: the camera looks north) is put
  // at the north end of its side instead. A chimney and its smoke in front of the building site hid the house being built.
  const inFront = (x, z) => clear.some(r => x > r.minX - 2 && x < r.maxX + 2 && z > r.maxZ && z - r.maxZ < 10);
  const chimneys = [[b.minX - 9.5, b.maxZ + 3], [b.maxX + 9.5, b.maxZ + 3]].map(([x, z]) => (inFront(x, z) ? [x, b.minZ - 3] : [x, z]));
  return { slabs, buildings: all.filter(o => !clear.some(r => stands(o, r))), chimneys };
}

// ------------------------------------------------------------------------------------------ the building site
/**
 * How much of a build is to be seen: -1 nothing (not started), 0 the lot marked out, 1 and up that many finished
 * stages, and all of them for a finished build.
 * @param site  the company's `site`: { done, at, stage }
 */
export function stagesShown(site, build) {
  if (site.done.includes(build.id)) return build.stages.length;
  return site.at === build.id ? site.stage : -1;
}

/** A stage in work is drawn in this many steps: the site is made again at most this often while a stage fills. */
export const PART_STEPS = 20;
/**
 * How far the stage in work has got, 0 to 1, rounded down to a step: the average, over its goods, of the share of
 * each that has arrived. So 900 bricks and 250 glass count the same, and a stage is at 1 only when every good is there.
 * @param needs  what Company.siteNeeds() returns: [{ have, need }]
 */
export function stagePart(needs) {
  if (!needs || !needs.length) return 0;
  const mean = needs.reduce((sum, g) => sum + (g.need > 0 ? Math.max(0, Math.min(1, g.have / g.need)) : 1), 0) / needs.length;
  return Math.floor(mean * PART_STEPS + 1e-9) / PART_STEPS;
}

/**
 * What tells one picture of the site from another: the plot is drawn again only when this changes.
 * @param part    how far the stage in work has got (stagePart)
 * @param inside  the id of the build the player stands inside, or ''
 */
export const siteKey = (site, open, part = 0, inside = '') =>
  (open ? 'open' : 'shut') + '|' + BUILDS.map(b => stagesShown(site, b)).join(',') + (part > 0 || inside ? `|${part}|${inside}` : '');

const block = (w, h, d, color, x, y, z, more = {}) => ({ kind: 'block', w, h, d, color, at: [x, y, z], ...more });
const round = (rt, rb, h, color, x, y, z, more = {}) => ({ kind: 'round', rt, rb, h, color, at: [x, y, z], ...more });
const COLORS = { slab: 0xb9bcc0, earth: 0x8c6f4d, pane: 0x2b3a4a, glass: 0x7fc4e8, lit: 0xffe9a8, wood: 0x8b5a2b, steel: 0x6b7078, peg: 0xf2c230, door: 0x6b4a2f,
  green: 0x6fa84f, bush: 0x4f8f3f, path: 0xd9cfb8, asphalt: 0x5c626b, line: 0xf2f2f2, gold: 0xe3b341, water: 0x6fc3e8, crane: 0xf2a900, brick: 0xb8553a };

const BASE = 0.3;       // the height of a foundation
const WALL = 0.35;      // how thick the walls of a building in work are drawn
const SILL = 0.45;      // how high the front wall is drawn while the player stands inside
const SIGN_TOP = 4.5;   // the sign over a lot hangs above the walls as they rise, up to this height: over a tower it would leave the screen
/** Layers of the stage in work that are not built up bit by bit: each is there from this share of the stage on. */
const STARTS = { garden: 0.5, parking: 0.5, plaza: 0.5, lobby: 0.5 };

/** The measures of a build that its picture and its footprint share. */
function frame(build) {
  const s = build.shape, w = s.width, d = s.depth, cols = Math.max(2, Math.floor(w / 1.5)), gap = w / cols;
  const hasDoor = build.stages.some(st => st.adds.includes('door'));
  return {
    s, w, d, cols, gap, H: s.floors * s.floor,
    doorX: hasDoor ? -w / 2 + gap * (Math.floor(cols / 2) + 0.5) : 0,   // where the door, or the lobby, will be: the way in while it is built
    doorW: Math.min(1.6, gap * 0.85),
  };
}
/**
 * What of a build is there, by layer: 1 for a layer of a finished stage, the stage's progress for a layer of the
 * stage in work, 0 otherwise.
 */
function layersOf(build, shown, part) {
  const done = new Set(build.stages.slice(0, shown).flatMap(st => st.adds));
  const now = part > 0 && shown < build.stages.length ? new Set(build.stages[shown].adds) : new Set();
  const amount = name => (done.has(name) ? 1 : now.has(name) ? part : 0);
  return {
    amount,
    has: name => amount(name) >= (STARTS[name] ?? 1) - 1e-9,
    floors: name => (done.has(name) ? build.shape.floors : now.has(name) ? Math.floor(part * build.shape.floors + 1e-9) : 0),
    closed: done.has('walls') && done.has('roof'),   // walls and a roof: a building, not a building site
  };
}

/**
 * A build as a list of blocks and cylinders, as far as it has got. Coordinates are the lot's own: x to the east,
 * z to the south (toward the camera), y up, with the middle of the building on the ground at (0, 0, 0).
 * Every stage adds the layers its data names (js/data/builds.js, `adds`), so a later picture holds everything of an
 * earlier one. While a build is not finished, the works stand around it: pegs, scaffolding and, for a tall one, a crane.
 *
 * The stage in work is drawn as far as its goods have arrived (`part`): the foundation and the walls by height;
 * windows, glass, lights and balconies floor by floor; gardens, car parks and the like from a set share on (STARTS).
 * A roof comes only with its finished stage, and the door with it: the roof is what closes the building. Until
 * then the walls stand around an empty inside with a doorway in the front, and the player can walk in.
 * @param shown  see stagesShown: 0 the lot marked out, up to build.stages.length
 * @param o      part: how far the stage in work has got, 0 to 1 (0 draws exactly the finished stages);
 *               cutaway: the player stands inside, so the front wall is a low sill and nothing hangs on it
 * @returns parts: { kind: 'block' | 'round', sizes, color, at: [x, y, z], turn?: [rx, ry, rz], glow?: true }
 */
export function buildParts(build, shown, { part = 0, cutaway = false } = {}) {
  if (shown < 0) return [];
  const { s, w, d, cols, gap, H, doorX, doorW } = frame(build), base = BASE, top = base + H;
  const { amount, has, floors, closed } = layersOf(build, shown, part);
  const parts = [], add = (...p) => parts.push(...p);
  const south = d / 2, front = !cutaway || closed;   // what hangs on the front wall is drawn unless the player is inside
  const rows = (upTo, fn) => { for (let f = 0; f < upTo; f++) for (let c = 0; c < cols; c++) fn(-w / 2 + gap * (c + 0.5), base + s.floor * (f + 0.55), f, c); };

  const slab = amount('slab'), wall = amount('walls'), h = H * wall;
  if (slab < 1) add(block(w + 1, 0.12, d + 1, COLORS.earth, 0, 0.06, 0));   // the pit, until the foundation is laid
  if (slab > 0) add(block(w + 0.8, base * slab, d + 0.8, COLORS.slab, 0, base * slab / 2, 0));
  if (closed) add(block(w, H, d, s.wall, 0, base + H / 2, 0));
  else if (wall > 0) {   // no roof yet: walls around an empty inside, with the doorway in the front
    const t = WALL, y = base + h / 2, low = front ? h : Math.min(h, SILL);
    const left = doorX - doorW / 2 + w / 2, right = w / 2 - (doorX + doorW / 2), doorH = Math.min(h, s.floor * 0.85);
    add(block(w, h, t, s.wall, 0, y, -d / 2 + t / 2), block(t, h, d - 2 * t, s.wall, -w / 2 + t / 2, y, 0), block(t, h, d - 2 * t, s.wall, w / 2 - t / 2, y, 0),
      block(left, low, t, s.wall, -w / 2 + left / 2, base + low / 2, d / 2 - t / 2), block(right, low, t, s.wall, w / 2 - right / 2, base + low / 2, d / 2 - t / 2),
      block(w - 2 * t, 0.05, d - 2 * t, 0x6b6257, 0, base + 0.03, 0));
    if (front && h > doorH + 0.05) add(block(doorW, h - doorH, t, s.wall, doorX, base + doorH + (h - doorH) / 2, d / 2 - t / 2));   // the wall over the doorway
  }
  const panes = floors('windows'), bands = floors('glass');
  if (panes) {
    if (front) rows(panes, (x, y, f, c) => { if (f === 0 && c === Math.floor(cols / 2) && (has('door') || !closed)) return; add(block(gap * 0.55, s.floor * 0.5, 0.08, COLORS.pane, x, y, south + 0.02)); });   // none where the door is, or will be
    for (let f = 0; f < panes; f++) for (const side of [-1, 1]) add(block(0.08, s.floor * 0.5, d * 0.5, COLORS.pane, side * (w / 2 + 0.02), base + s.floor * (f + 0.55), 0));
  }
  for (let f = 0; f < bands; f++) {   // a glass front: one band a floor, on the three sides the camera sees
    const y = base + s.floor * (f + 0.5), open = f === 0 && !closed;   // on the ground floor the band leaves the doorway free while the building is in work
    if (front && !open) add(block(w * 0.92, s.floor * 0.72, 0.08, COLORS.glass, 0, y, south + 0.02));
    else if (front) for (const [from, to] of [[-w * 0.46, doorX - doorW / 2 - 0.1], [doorX + doorW / 2 + 0.1, w * 0.46]]) add(block(to - from, s.floor * 0.72, 0.08, COLORS.glass, (from + to) / 2, y, south + 0.02));
    for (const side of [-1, 1]) add(block(0.08, s.floor * 0.72, d * 0.92, COLORS.glass, side * (w / 2 + 0.02), y, 0));
  }
  const atDoor = (x, f) => f === 0 && !closed && Math.abs(x - doorX) < doorW / 2 + gap * 0.25;   // nothing is hung across the open doorway
  if (front) rows(floors('lights'), (x, y, f, c) => { if ((f * 7 + c * 3) % 3 !== 0 && !atDoor(x, f)) add(block(gap * 0.5, s.floor * 0.42, 0.06, COLORS.lit, x, y, south + 0.07, { glow: true })); });
  if (front) for (let f = 1; f < Math.min(s.floors, floors('balconies') + 1); f++) add(block(w * 0.9, 0.08, 0.5, COLORS.slab, 0, base + s.floor * f, south + 0.25));
  if (has('door') && closed) add(block(gap * 0.5, s.floor * 0.8, 0.1, COLORS.door, doorX, base + s.floor * 0.4, south + 0.03));
  if (has('lobby') && front) add(block(w * 0.5, 0.14, 1.4, COLORS.gold, 0, base + s.floor * 0.95, south + 0.7),
    block(0.14, s.floor * 0.9, 0.14, COLORS.gold, -w * 0.22, base + s.floor * 0.45, south + 1.3), block(0.14, s.floor * 0.9, 0.14, COLORS.gold, w * 0.22, base + s.floor * 0.45, south + 1.3),
    ...(closed ? [block(w * 0.4, s.floor * 0.8, 0.1, COLORS.glass, 0, base + s.floor * 0.45, south + 0.05)] : []));   // the glass doors close the way in with the roof
  if (has('roof')) {
    if (s.roof === 'pitched') {   // two slopes over an attic, the ridge running east to west
      const rise = 0.34 * d, slope = Math.hypot(d / 2 + 0.3, rise), tilt = Math.atan2(rise, d / 2);
      add(block(w, rise * 0.55, d * 0.5, s.wall, 0, top + rise * 0.27, 0));
      for (const side of [-1, 1]) add(block(w + 0.6, 0.16, slope, s.roofColor, 0, top + rise / 2, side * d / 4, { turn: [side * tilt, 0, 0] }));
      add(block(w + 0.7, 0.14, 0.34, 0x8f3f2c, 0, top + rise + 0.04, 0));               // the ridge, so the two slopes read as a roof from above
      add(block(0.5, 1, 0.5, COLORS.brick, w * 0.28, top + rise * 0.9, -d * 0.12));   // a chimney
    } else {
      add(block(w + 0.4, 0.25, d + 0.4, s.roofColor, 0, top + 0.12, 0), block(1.1, 0.5, 1.1, 0xe3e7ea, w * 0.2, top + 0.5, -d * 0.15));
      if (s.roof === 'crown') add(block(w * 0.6, 0.7, d * 0.6, s.wall, 0, top + 0.6, 0), block(w * 0.66, 0.14, d * 0.66, s.roofColor, 0, top + 1.02, 0));
    }
  }
  if (has('antenna')) add(round(0.06, 0.09, 2.4, COLORS.steel, 0, top + 2.2, 0), round(0.14, 0.14, 0.14, 0xd4483b, 0, top + 3.4, 0));
  if (has('garden')) {
    add(block(w + 4, 0.06, d + 4.4, COLORS.green, 0, 0.03, 0.3), block(1, 0.08, 2.6, COLORS.path, doorX, 0.05, south + 1.5));
    for (const [x, z, r] of [[-w / 2 - 1.3, south + 0.6, 0.55], [w / 2 + 1.2, south + 0.9, 0.7], [w / 2 + 1.5, -d / 2 + 0.6, 0.5]]) add(round(r * 0.55, r, r * 1.3, COLORS.bush, x, r * 0.65, z));
  }
  if (has('parking')) {
    add(block(w + 2, 0.06, 3.4, COLORS.asphalt, 0, 0.035, south + 2.6));
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + (w / 4) * (i + 0.5);
      add(block(0.06, 0.02, 2.2, COLORS.line, x - w / 8, 0.075, south + 2.6));
      if (i !== 2) add(block(0.95, 0.42, 1.8, [0xe23d3d, 0x3d7be2, 0xf0f0f0, 0x2f9e6b][i], x, 0.3, south + 2.6), block(0.85, 0.3, 0.9, COLORS.pane, x, 0.62, south + 2.5));
    }
  }
  if (has('plaza')) add(block(w + 5, 0.07, d + 4, COLORS.path, 0, 0.035, 0.6), round(1.1, 1.1, 0.3, COLORS.slab, w * 0.42, 0.18, south + 2), round(0.9, 0.9, 0.34, COLORS.water, w * 0.42, 0.19, south + 2),
    round(0.4, 0.75, 1, COLORS.bush, -w * 0.45, 0.55, south + 2.1));

  if (shown < build.stages.length) {   // the works, until the build is finished
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(block(0.12, 0.7, 0.12, COLORS.peg, x * (w / 2 + 0.9), 0.35, z * (d / 2 + 0.9)));
    add(round(0.2, 1.1, 0.8, COLORS.earth, -w / 2 - 1.6, 0.4, south + 1.2), block(1, 0.14, 1, COLORS.wood, w / 2 + 1.6, 0.07, south + 1.4), block(0.8, 0.5, 0.8, COLORS.brick, w / 2 + 1.6, 0.39, south + 1.4));
    if (wall > 0 && !closed && front) {   // scaffolding along the front, as high as the walls have got
      const n = Math.max(2, Math.round(w / 2.2));
      for (let i = 0; i <= n; i++) add(round(0.05, 0.05, h, COLORS.steel, -w / 2 + (w / n) * i, base + h / 2, south + 0.55));
      for (let f = 1; f <= s.floors && s.floor * f <= h + 1e-9; f++) add(block(w, 0.06, 0.45, COLORS.wood, 0, base + s.floor * f - 0.1, south + 0.55));
    }
    if (s.floors >= 5) {   // a tower crane beside the building, taller than it will be
      const [cx, cz] = craneAt(build), mast = H + 3.2;
      add(block(1.3, 0.3, 1.3, COLORS.slab, cx, 0.15, cz), block(0.32, mast, 0.32, COLORS.crane, cx, mast / 2, cz), block(w * 0.95 + 2.6, 0.24, 0.24, COLORS.crane, cx + (w * 0.95 + 2.6) / 2 - 1.3, mast, cz),
        block(0.9, 0.6, 0.6, COLORS.slab, cx - 1, mast - 0.2, cz), round(0.02, 0.02, 1.6, COLORS.steel, cx + w * 0.6, mast - 0.8, cz));
    }
  }
  return parts;
}
/** Where the crane of a tall build stands, in the lot's own coordinates. */
const craneAt = build => [-build.shape.width / 2 - 1.8, -build.shape.depth / 2 - 0.6];

/** Where a build's lot is in the world: the middle of its building on the ground, [x, z]. */
export const lotOf = build => [SITE.plot.minX + build.shape.at[0], SITE.plot.minZ + build.shape.at[1]];

/**
 * The plot itself, in world coordinates: its ground, a fence of posts and rails with a gap for the gate in the south
 * and one in the west, opposite the opening in the Department Store's fence (SITE.gate), and where the sign stands.
 */
export function plotParts() {
  const p = SITE.plot, cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2, w = p.maxX - p.minX, d = p.maxZ - p.minZ, parts = [];
  parts.push(block(w, 0.04, d, 0xb7a98c, cx, 0.03, cz));   // trodden ground, over the grass and the asphalt band
  const post = (x, z) => parts.push(block(0.16, 1, 0.16, COLORS.wood, x, 0.5, z));
  const rail = (x0, z0, x1, z1) => { const along = x0 !== x1, len = Math.hypot(x1 - x0, z1 - z0); parts.push(block(along ? len : 0.07, 0.1, along ? 0.07 : len, 0xe8dcc0, (x0 + x1) / 2, 0.8, (z0 + z1) / 2), block(along ? len : 0.07, 0.1, along ? 0.07 : len, COLORS.crane, (x0 + x1) / 2, 0.5, (z0 + z1) / 2)); };
  const gate = [cx - 2, cx + 2];   // the opening in the south side, toward the camera
  const way = [SITE.gate.at - SITE.gate.half, SITE.gate.at + SITE.gate.half];   // the way in from the store, in the west side
  for (let x = p.minX; x <= p.maxX + 0.01; x += 3) { post(x, p.minZ); if (x < gate[0] || x > gate[1]) post(x, p.maxZ); }
  for (let z = p.minZ + 3; z < p.maxZ - 0.01; z += 3) { if (z < way[0] || z > way[1]) post(p.minX, z); post(p.maxX, z); }
  post(p.minX, way[0]); post(p.minX, way[1]);   // a post at each side of the way in
  rail(p.minX, p.minZ, p.maxX, p.minZ); rail(p.maxX, p.minZ, p.maxX, p.maxZ);
  rail(p.minX, p.minZ, p.minX, way[0]); rail(p.minX, way[1], p.minX, p.maxZ);
  rail(p.minX, p.maxZ, gate[0] - 1, p.maxZ); rail(gate[1] + 1, p.maxZ, p.maxX, p.maxZ);
  // the ground between the store's fence and the plot's, trodden like the plot: a path to walk in on
  parts.push(block(p.minX - SITE.gate.x, 0.04, SITE.gate.half * 2, 0xb7a98c, (SITE.gate.x + p.minX) / 2, 0.03, SITE.gate.at));
  return { parts, sign: [gate[1] + 2.2, p.maxZ + 0.6] };
}

// ------------------------------------------------------------------------------------------ walking on the site
/**
 * A straight fence with openings in it, as the runs that are left: [x1, z1, x2, z2] each.
 * @param line  the fence from end to end, along x or along z
 * @param gaps  [{ at, half }]: the middle of an opening along the fence, and half its width
 */
export function fenceRuns([x1, z1, x2, z2], gaps = []) {
  const alongX = z1 === z2, from = alongX ? x1 : z1, to = alongX ? x2 : z2, runs = [];
  const piece = (a, b) => { if (b - a > 0.2) runs.push(alongX ? [a, z1, b, z1] : [x1, a, x1, b]); };
  let at = Math.min(from, to);
  for (const g of [...gaps].sort((a, b) => a.at - b.at)) { piece(at, g.at - g.half); at = Math.max(at, g.at + g.half); }
  piece(at, Math.max(from, to));
  return runs;
}
const EDGE = 0.8;   // how far from a fence the player stops, as in a yard
/**
 * The ground of the site the player may step on, as two rectangles: the plot inside its fence, and the passage
 * from the Department Store through the two openings. They overlap each other and the store's own ground.
 */
export function siteWalk() {
  const p = SITE.plot, g = SITE.gate, reach = 1.6, t = g.half - 0.3;
  return {
    plot: { minX: p.minX + EDGE, maxX: p.maxX - EDGE, minZ: p.minZ + EDGE, maxZ: p.maxZ - EDGE },
    door: { minX: g.x - reach, maxX: p.minX + reach, minZ: g.at - t, maxZ: g.at + t },
  };
}
/** Just inside the plot's entrance: where "Go to the site" puts the player. */
export const siteEntrance = () => ({ x: SITE.plot.minX + 2.2, z: SITE.gate.at });

const inRect = (x, z, r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const PAD = 0.3;    // a footprint is this much larger than what is drawn: a figure has a width
const THICK = 0.9;  // a wall stops the player over this depth. A step on a slow phone is longer than the wall is thick.

/**
 * The footprints nobody walks through, in world coordinates: the whole of a building with walls and a roof, the
 * walls of one in work with the doorway left free, and the foot of a crane.
 * @param part  how far the stage in work has got (stagePart)
 */
export function siteBlocks(site, part = 0) {
  const out = [];
  for (const b of BUILDS) {
    const shown = stagesShown(site, b);
    if (shown < 0) continue;
    const [lx, lz] = lotOf(b), { w, d, doorX, doorW } = frame(b), { amount, closed } = layersOf(b, shown, shown === site.stage && site.at === b.id ? part : 0);
    const rect = (x0, x1, z0, z1) => out.push({ minX: lx + x0, maxX: lx + x1, minZ: lz + z0, maxZ: lz + z1, build: b.id });
    if (closed) rect(-w / 2 - PAD, w / 2 + PAD, -d / 2 - PAD, d / 2 + PAD);
    else if (amount('walls') > 0) {
      const o = THICK - WALL / 2;   // from the outer face inward
      rect(-w / 2 - PAD, w / 2 + PAD, -d / 2 - PAD, -d / 2 + o);                 // north
      rect(-w / 2 - PAD, -w / 2 + o, -d / 2 - PAD, d / 2 + PAD);                 // west
      rect(w / 2 - o, w / 2 + PAD, -d / 2 - PAD, d / 2 + PAD);                   // east
      rect(-w / 2 - PAD, doorX - doorW / 2, d / 2 - o, d / 2 + PAD);             // south, left of the doorway
      rect(doorX + doorW / 2, w / 2 + PAD, d / 2 - o, d / 2 + PAD);              // south, right of it
    }
    if (shown < b.stages.length && b.shape.floors >= 5) { const [cx, cz] = craneAt(b); rect(cx - 0.9, cx + 0.9, cz - 0.9, cz + 0.9); }
  }
  return out;
}
/**
 * The build the player stands inside: one in work, with walls up and no roof. '' anywhere else.
 * The front wall of that build is then drawn low (buildParts, cutaway).
 */
export function insideOf(site, part, x, z) {
  const b = BUILDS.find(o => o.id === site.at);
  if (!b) return '';
  const { amount, closed } = layersOf(b, site.stage, part), [lx, lz] = lotOf(b), s = b.shape;
  if (closed || !(amount('walls') > 0)) return '';
  return inRect(x, z, { minX: lx - s.width / 2, maxX: lx + s.width / 2, minZ: lz - s.depth / 2, maxZ: lz + s.depth / 2 + 0.2 }) ? b.id : '';
}
/** How high the ground is at a point of the plot: the top of a foundation where one lies, else 0. The player is lifted by it. */
export function groundAt(site, part, x, z) {
  for (const b of BUILDS) {
    const shown = stagesShown(site, b);
    if (shown < 0) continue;
    const [lx, lz] = lotOf(b), s = b.shape, slab = layersOf(b, shown, site.at === b.id ? part : 0).amount('slab');
    if (slab > 0 && inRect(x, z, { minX: lx - s.width / 2 - 0.4, maxX: lx + s.width / 2 + 0.4, minZ: lz - s.depth / 2 - 0.4, maxZ: lz + s.depth / 2 + 0.4 })) return BASE * slab;
  }
  return 0;
}

// ------------------------------------------------------------------------------------------ the sign over a lot
/**
 * What the sign over the site says, from the company's site.
 * @param o  site: the company's site; needs: Company.siteNeeds(); open: the site is open; labels: goods by id -> name;
 *           part: how far the stage in work has got (stagePart), for where the sign hangs
 * @returns {{ build, at: [x, y, z], title, sub, percent, goods: string[] }|null}
 *   A stage in work: the building, the stage, how far it is, and each good with what has arrived.
 *   Nothing in work and a build to start: its name and where to start it. Everything built, or the site shut: null.
 */
export function siteSign({ site, needs, open, labels, part = 0 }) {
  if (!open) return null;
  // Behind the lot and over what stands on it so far, so that it covers neither the work nor the player: the camera
  // looks north, and what is further north and higher is drawn further up the screen. Never higher than a house.
  const at = (b, shown, f) => { const [x, z] = lotOf(b), h = b.shape.floors * b.shape.floor * layersOf(b, shown, f).amount('walls'); return [x, Math.min(h, SIGN_TOP) + 2.5, z - b.shape.depth / 2 - 0.5]; };
  const b = BUILDS.find(o => o.id === site.at);
  if (b) {
    const stage = b.stages[site.stage];
    const share = needs.length ? needs.reduce((s, g) => s + (g.need > 0 ? Math.min(1, g.have / g.need) : 1), 0) / needs.length : 0;   // as the building is drawn (stagePart), not rounded to a step
    return {
      build: b.id, at: at(b, site.stage, part), title: b.name, sub: `${stage.name} · stage ${site.stage + 1} of ${b.stages.length}`,
      percent: Math.floor(share * 100 + 1e-9),
      goods: needs.map(g => `${labels[g.item] || g.item} ${Math.min(g.have, g.need)} / ${g.need}`),
    };
  }
  const next = BUILDS.find(o => !site.done.includes(o.id));
  return next ? { build: next.id, at: at(next, 0, 0), title: next.name, sub: 'Start it in Headquarters, Construction', percent: null, goods: [] } : null;
}
