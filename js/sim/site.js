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
  return { slabs, buildings: all.filter(o => !clear.some(r => stands(o, r))), chimneys: [[b.minX - 9.5, b.maxZ + 3], [b.maxX + 9.5, b.maxZ + 3]] };
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

/** What tells one picture of the site from another: the plot is drawn again only when this changes. */
export const siteKey = (site, open) => (open ? 'open' : 'shut') + '|' + BUILDS.map(b => stagesShown(site, b)).join(',');

const block = (w, h, d, color, x, y, z, more = {}) => ({ kind: 'block', w, h, d, color, at: [x, y, z], ...more });
const round = (rt, rb, h, color, x, y, z, more = {}) => ({ kind: 'round', rt, rb, h, color, at: [x, y, z], ...more });
const COLORS = { slab: 0xb9bcc0, earth: 0x8c6f4d, pane: 0x2b3a4a, glass: 0x7fc4e8, lit: 0xffe9a8, wood: 0x8b5a2b, steel: 0x6b7078, peg: 0xf2c230, door: 0x6b4a2f,
  green: 0x6fa84f, bush: 0x4f8f3f, path: 0xd9cfb8, asphalt: 0x5c626b, line: 0xf2f2f2, gold: 0xe3b341, water: 0x6fc3e8, crane: 0xf2a900, brick: 0xb8553a };

/**
 * A build as a list of blocks and cylinders, as far as it has got. Coordinates are the lot's own: x to the east,
 * z to the south (toward the camera), y up, with the middle of the building on the ground at (0, 0, 0).
 * Every stage adds the layers its data names (js/data/builds.js, `adds`), so a later picture holds everything of an
 * earlier one. While a build is not finished, the works stand around it: pegs, scaffolding and, for a tall one, a crane.
 * @param shown  see stagesShown: 0 the lot marked out, up to build.stages.length
 * @returns parts: { kind: 'block' | 'round', sizes, color, at: [x, y, z], turn?: [rx, ry, rz], glow?: true }
 */
export function buildParts(build, shown) {
  if (shown < 0) return [];
  const s = build.shape, w = s.width, d = s.depth, H = s.floors * s.floor, base = 0.3, top = base + H;
  const layers = new Set(build.stages.slice(0, shown).flatMap(st => st.adds));
  const has = name => layers.has(name), parts = [], add = (...p) => parts.push(...p);
  const south = d / 2, cols = Math.max(2, Math.floor(w / 1.5)), gap = w / cols;
  const rows = (fn) => { for (let f = 0; f < s.floors; f++) for (let c = 0; c < cols; c++) fn(-w / 2 + gap * (c + 0.5), base + s.floor * (f + 0.55), f, c); };

  if (!has('slab')) add(block(w + 1, 0.12, d + 1, COLORS.earth, 0, 0.06, 0));   // the pit, until the foundation is laid
  else add(block(w + 0.8, base, d + 0.8, COLORS.slab, 0, base / 2, 0));
  if (has('walls') && has('roof')) add(block(w, H, d, s.wall, 0, base + H / 2, 0));
  else if (has('walls')) {   // no roof yet: four walls around an empty inside, as a building under construction looks from above
    const t = 0.35, y = base + H / 2;
    add(block(w, H, t, s.wall, 0, y, -d / 2 + t / 2), block(w, H, t, s.wall, 0, y, d / 2 - t / 2), block(t, H, d - 2 * t, s.wall, -w / 2 + t / 2, y, 0), block(t, H, d - 2 * t, s.wall, w / 2 - t / 2, y, 0),
      block(w - 2 * t, 0.05, d - 2 * t, 0x6b6257, 0, base + 0.03, 0));
  }
  if (has('windows')) {
    rows((x, y, f, c) => { if (f === 0 && has('door') && c === Math.floor(cols / 2)) return; add(block(gap * 0.55, s.floor * 0.5, 0.08, COLORS.pane, x, y, south + 0.02)); });
    for (let f = 0; f < s.floors; f++) for (const side of [-1, 1]) add(block(0.08, s.floor * 0.5, d * 0.5, COLORS.pane, side * (w / 2 + 0.02), base + s.floor * (f + 0.55), 0));
  }
  if (has('glass')) for (let f = 0; f < s.floors; f++) {   // a glass front: one band a floor, on the three sides the camera sees
    const y = base + s.floor * (f + 0.5);
    add(block(w * 0.92, s.floor * 0.72, 0.08, COLORS.glass, 0, y, south + 0.02));
    for (const side of [-1, 1]) add(block(0.08, s.floor * 0.72, d * 0.92, COLORS.glass, side * (w / 2 + 0.02), y, 0));
  }
  if (has('lights')) rows((x, y, f, c) => { if ((f * 7 + c * 3) % 3 !== 0) add(block(gap * 0.5, s.floor * 0.42, 0.06, COLORS.lit, x, y, south + 0.07, { glow: true })); });
  if (has('balconies')) for (let f = 1; f < s.floors; f++) add(block(w * 0.9, 0.08, 0.5, COLORS.slab, 0, base + s.floor * f, south + 0.25));
  if (has('door')) add(block(gap * 0.5, s.floor * 0.8, 0.1, COLORS.door, -w / 2 + gap * (Math.floor(cols / 2) + 0.5), base + s.floor * 0.4, south + 0.03));
  if (has('lobby')) add(block(w * 0.5, 0.14, 1.4, COLORS.gold, 0, base + s.floor * 0.95, south + 0.7), block(w * 0.4, s.floor * 0.8, 0.1, COLORS.glass, 0, base + s.floor * 0.45, south + 0.05),
    block(0.14, s.floor * 0.9, 0.14, COLORS.gold, -w * 0.22, base + s.floor * 0.45, south + 1.3), block(0.14, s.floor * 0.9, 0.14, COLORS.gold, w * 0.22, base + s.floor * 0.45, south + 1.3));
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
    add(block(w + 4, 0.06, d + 4.4, COLORS.green, 0, 0.03, 0.3), block(1, 0.08, 2.6, COLORS.path, -w / 2 + gap * (Math.floor(cols / 2) + 0.5), 0.05, south + 1.5));
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
    if (has('walls') && !has('roof')) {   // scaffolding along the front, as high as the walls
      const n = Math.max(2, Math.round(w / 2.2));
      for (let i = 0; i <= n; i++) add(round(0.05, 0.05, H, COLORS.steel, -w / 2 + (w / n) * i, base + H / 2, south + 0.55));
      for (let f = 1; f <= s.floors; f++) add(block(w, 0.06, 0.45, COLORS.wood, 0, base + s.floor * f - 0.1, south + 0.55));
    }
    if (s.floors >= 5) {   // a tower crane beside the building, taller than it will be
      const cx = -w / 2 - 1.8, cz = -d / 2 - 0.6, mast = H + 3.2;
      add(block(1.3, 0.3, 1.3, COLORS.slab, cx, 0.15, cz), block(0.32, mast, 0.32, COLORS.crane, cx, mast / 2, cz), block(w * 0.95 + 2.6, 0.24, 0.24, COLORS.crane, cx + (w * 0.95 + 2.6) / 2 - 1.3, mast, cz),
        block(0.9, 0.6, 0.6, COLORS.slab, cx - 1, mast - 0.2, cz), round(0.02, 0.02, 1.6, COLORS.steel, cx + w * 0.6, mast - 0.8, cz));
    }
  }
  return parts;
}

/** Where a build's lot is in the world: the middle of its building on the ground, [x, z]. */
export const lotOf = build => [SITE.plot.minX + build.shape.at[0], SITE.plot.minZ + build.shape.at[1]];

/** The plot itself, in world coordinates: its ground, a fence of posts and rails with a gap for the gate in the south, and where the sign stands. */
export function plotParts() {
  const p = SITE.plot, cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2, w = p.maxX - p.minX, d = p.maxZ - p.minZ, parts = [];
  parts.push(block(w, 0.04, d, 0xb7a98c, cx, 0.03, cz));   // trodden ground, over the grass and the asphalt band
  const post = (x, z) => parts.push(block(0.16, 1, 0.16, COLORS.wood, x, 0.5, z));
  const rail = (x0, z0, x1, z1) => { const along = x0 !== x1, len = Math.hypot(x1 - x0, z1 - z0); parts.push(block(along ? len : 0.07, 0.1, along ? 0.07 : len, 0xe8dcc0, (x0 + x1) / 2, 0.8, (z0 + z1) / 2), block(along ? len : 0.07, 0.1, along ? 0.07 : len, COLORS.crane, (x0 + x1) / 2, 0.5, (z0 + z1) / 2)); };
  const gate = [cx - 2, cx + 2];   // the opening in the south side, toward the camera
  for (let x = p.minX; x <= p.maxX + 0.01; x += 3) { post(x, p.minZ); if (x < gate[0] || x > gate[1]) post(x, p.maxZ); }
  for (let z = p.minZ + 3; z < p.maxZ - 0.01; z += 3) { post(p.minX, z); post(p.maxX, z); }
  rail(p.minX, p.minZ, p.maxX, p.minZ); rail(p.minX, p.minZ, p.minX, p.maxZ); rail(p.maxX, p.minZ, p.maxX, p.maxZ);
  rail(p.minX, p.maxZ, gate[0] - 1, p.maxZ); rail(gate[1] + 1, p.maxZ, p.maxX, p.maxZ);
  return { parts, sign: [gate[1] + 2.2, p.maxZ + 0.6] };
}
