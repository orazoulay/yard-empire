// What dresses a yard, worked out as plain numbers: which things stand where along its fences, and what is painted on
// its floor. No drawing here: js/gfx/props.js turns these lists into shapes, tests/dressing.test.mjs checks them
// without a screen.
//
// The rules, in the order they are applied:
//   - Everything stands in the strip along a fence (its far edge at most REACH from the fence line) or in a corner at
//     the back of the yard. Nobody has a reason to walk there, and the things have no bodies of their own.
//   - Nothing stands in a gate, on a signpost, in a lamp post, in the opening to the building site, behind a shop's
//     sign, where customers come in, on a machine's ground (with the step people and trucks keep from it), on a pile,
//     or on a plot: bought or not, every plot of the yard's data is kept free.
//   - The camera looks north from the south. On the south side only low things stand; tall ones go to the back, and
//     not so tall where another yard lies behind (they would stand in front of its shop).
//   - A yard's layout is drawn from a run of numbers seeded by its id: the same yard looks the same on every device.
//   - A yard's dressing stays inside a budget of triangles (BUDGET), counted from the catalogue below.
import { mulberry } from './site.js';
import { fenceSpots } from './yard.js';
import { lookOf } from '../data/looks.js';
import { AREAS, gateGeom } from '../data/areas.js';
import { SITE } from '../data/builds.js';

export const INSET = 0.38;   // the back of a thing stands this far inside the fence line: clear of walls, posts and lamp feet
export const REACH = 1.85;   // how far from the fence line the far edge of a thing may lie (corner pieces aside)
export const CORNER = 3.1;   // the same for a piece that fills a back corner
export const LOW = 2.05;     // the tallest thing toward the camera's end of the two sides
export const FRONT = 1.6;    // the tallest thing along the south fence, between the camera and the yard
export const BUDGET = 4500;  // triangles of things in one yard (most yards use 2,000 to 3,300)
const GATE = 2.2;            // half the width of a gate (GATE_HALF in js/area.js)
const LINE = 2.1;            // how far inside the fence the painted line runs: just clear of the things
const ACROSS = { n: 's', s: 'n', w: 'e', e: 'w' };
const SIDES = ['n', 's', 'w', 'e'];

/**
 * The catalogue: how much room each thing takes, [length along the fence, depth into the yard, height, triangles],
 * and flags: c = fills a back corner, t = tall but thin (a mast, a pole: it hides nothing), l = it carries a lamp,
 * v = it grows at the foot of the fence (js/data/looks.js, `verge`). The shapes are in js/gfx/props.js under the same
 * names; `measureProps()` there prints what they really measure, and the numbers here are those, rounded up.
 */
export const PROPS = {
  // anywhere
  crate: [0.9, 0.9, 0.75, 36], crates: [1.75, 0.95, 1.35, 108], barrel: [0.65, 0.7, 0.95, 120], barrels: [1.55, 1.3, 0.95, 272],
  pallet: [1.4, 1.25, 1.2, 96], sacks: [1.55, 0.8, 0.7, 240], rocks: [1.65, 1.05, 0.6, 144], stump: [0.7, 0.8, 0.55, 32],
  bench: [2, 0.7, 1.1, 108], cones: [2.4, 0.55, 0.7, 96], bollards: [2.3, 0.4, 0.95, 144], hazardsign: [0.85, 0.3, 2, 56],
  lantern: [0.3, 0.65, 2.25, 72, 'l'], lampglobe: [0.75, 0.45, 3.15, 124, 'tl'], litterbin: [0.65, 0.65, 1, 48], handtruck: [0.8, 0.85, 1.5, 132],
  floodlight: [0.95, 0.65, 4.75, 92, 'tl'], toolrack: [1.75, 0.6, 1.55, 132], wheelbarrow: [2, 0.8, 0.95, 164], planter: [2.3, 0.85, 1.2, 84], planttree: [1.3, 1.1, 2.85, 144, 't'],
  flowerbox: [1.85, 0.55, 0.9, 96], tuft: [0.4, 0.3, 0.5, 4, 'v'], flower: [0.35, 0.3, 0.4, 18, 'v'], pebble: [0.5, 0.4, 0.15, 24, 'v'],
  // Lumber Town
  logdeck: [3.4, 1.4, 1.2, 240], sawhorse: [1.75, 0.95, 1.25, 116], plankstack: [2.65, 1.25, 0.9, 120], firewood: [1.9, 0.65, 1.4, 240],
  stumpaxe: [0.95, 1.05, 1.2, 104], timbershed: [3.95, 1.4, 2.85, 204, 'l'], pennant: [0.4, 0.5, 4, 56, 't'],
  workbench: [2.2, 1.05, 2, 216], timberrack: [2.1, 1.2, 2.2, 156], chairframes: [1.75, 0.85, 1.25, 168], toolshed: [2.9, 1.4, 3, 102, 'l'],
  stoneblocks: [2.65, 1.4, 1.45, 84], hoist: [2.35, 1.4, 3.55, 176, 't'], brickpallet: [1.4, 1.25, 0.95, 120],
  haybales: [2.4, 1.4, 1.2, 148], scarecrow: [2.15, 0.5, 2.55, 164, 't'], windpump: [1.8, 1.45, 5.8, 288, 't'], trough: [1.85, 1.15, 0.6, 60],
  vegcrates: [1.85, 1.05, 0.55, 164], churns: [1.4, 0.7, 0.85, 144],
  breadcart: [3.65, 1.3, 2.3, 340], breadcrates: [1.25, 0.9, 1.1, 132], cafetable: [1.8, 1.15, 2.6, 236, 't'],
  sandheap: [2.35, 1.45, 1.4, 78], glassrack: [2.1, 1.15, 2, 224], carboys: [1.4, 0.7, 1.05, 168], sandsilo: [1.4, 1.45, 3.55, 192],
  minecart: [3.8, 1.25, 1.25, 332], pitprops: [2.8, 1.15, 0.85, 132], oreheap: [2.1, 1.4, 0.75, 118],
  anvil: [1.45, 0.85, 1, 116], coalbin: [1.75, 1.15, 1.15, 132], barrack: [1.95, 0.7, 1.4, 180], quenchtub: [0.95, 1, 1.2, 88], hearth: [1.85, 1.35, 3.55, 112, 'l'],
  pipestack: [3.45, 1.35, 1.15, 240], valvetree: [1.25, 0.9, 2.05, 216], drumrack: [2.35, 1, 1.75, 224], bullettank: [3.2, 1.45, 2.05, 212], windsock: [0.5, 0.6, 4.1, 100, 't'],
  sluice: [3.85, 1.2, 1.5, 224], strongboxes: [1.5, 0.85, 1.2, 132], goldpans: [1.4, 0.8, 1.25, 100],
  displaycase: [1.4, 0.9, 1.7, 140], velvetrope: [2.95, 0.4, 1.2, 192], safe: [1.15, 1.1, 1.6, 140], topiary: [0.85, 0.95, 2.2, 148], gempost: [0.95, 1, 2.65, 196, 'tl'],
  crystals: [1.7, 1.1, 2, 192, 'l'],
  // Industrial City
  transformer: [2.3, 1.4, 2.45, 320], cabledrums: [2.7, 1.3, 1.5, 242], switchgear: [2, 0.75, 2.05, 204], pylon: [1.5, 0.9, 5.9, 160, 't'], cellrack: [1.85, 0.65, 1.65, 228],
  coils: [2.65, 1.1, 1.8, 240], beams: [3.75, 1.15, 0.8, 204], slagbin: [1.85, 1.4, 1.2, 160], gascyl: [1.75, 0.65, 1.85, 264], gantry: [4.05, 1.45, 3.6, 180, 't'], ventshed: [3, 1.4, 3, 224, 'l'],
  totes: [2.65, 1.35, 1.4, 264], piperack: [4.85, 1.1, 2.9, 336], tankfarm: [3, 2.7, 3.25, 352, 'c'], drumpallet: [1.4, 1.45, 1.2, 168], shower: [1, 0.9, 2.7, 156, 't'],
  servers: [2.2, 0.85, 2.25, 204], acunit: [1.65, 0.9, 1.25, 166], partsbins: [1.75, 0.65, 1.85, 192], dishmast: [1.75, 1.25, 5.6, 152, 't'], solar: [2.2, 1.35, 1.35, 144],
  // Commercial Metropolis
  enginestand: [1.4, 1.1, 1.5, 204], toolchest: [1.95, 0.7, 1.4, 168], forklift: [3.3, 1.35, 2.55, 344], neongear: [2.95, 0.35, 3.15, 240, 'l'], neoncar: [2.95, 0.35, 3.15, 228, 'l'], neonbot: [2.95, 0.35, 3.15, 192, 'l'],
  tyres: [1.7, 1.15, 1.35, 216], carbody: [3, 1.45, 1.45, 184], panelrack: [2.2, 0.9, 1.9, 204], chargepost: [0.7, 0.45, 1.7, 80],
  chargedock: [3.35, 1.25, 1.75, 276, 'l'], armcrate: [1.65, 1.25, 1.4, 152], dronepad: [1.3, 1.45, 0.5, 216],
  showcase: [2.9, 1, 2.45, 228, 'l'], giftstack: [1.45, 1.2, 1.6, 188], kiosk: [2.65, 1.4, 3.05, 248, 'l'], bunting: [4.95, 0.35, 3.15, 85, 't'], balloons: [0.25, 0.5, 3.05, 108, 't'],
  bollardlights: [2.5, 0.35, 1, 108],
};
const size = kind => { const [w, d, h, tris, flags = ''] = PROPS[kind]; return { w, d, h, tris, flags }; };

/** Colours for the things that come in several, picked by the yard's own run of numbers. A yard may name its own (js/data/looks.js, `tints`). */
export const TINTS = {
  crate: [0xc99a5b, 0xb5803f, 0xd9b47c, 0xa9713a], crates: [0xc99a5b, 0xb5803f, 0xd9b47c, 0xa9713a],
  barrel: [0xd94a36, 0x3f7fc4, 0x3a3f46, 0x4c9a5a, 0xe0a52f], barrels: [0xd94a36, 0x3f7fc4, 0x4c9a5a, 0xe0a52f],
  pallet: [0xc9a36a, 0x8fa9c2, 0xd9d2c0, 0xb98a5a], carbody: [0xe23d3d, 0x2f7fd6, 0xf2c230, 0xeef0f2, 0x2f8f83],
  totes: [0x3f94c9, 0x58b86a, 0xff8fc8, 0xf2b630], drumpallet: [0x2f6fd6, 0xd94a36, 0x3a8f55], minecart: [0x7a5c4f], oreheap: [0x7a5c4f],
  planter: [0x4f9a3f, 0x5aa845, 0x3f8f47], flower: [0xffffff, 0xffe066, 0xff9ec4, 0xc9a6ff, 0xffb347], drumrack: [0xd94a36, 0x3f7fc4, 0x4c9a5a], giftstack: [0xc74bd6, 0xe23d3d, 0x2f7fd6, 0x2f8f83], balloons: [0xe23d3d, 0xf2c230, 0x3ad6e6, 0xc74bd6],
};

// ------------------------------------------------------------------------------------------ the sides of a yard
/**
 * One side of a yard as a ruler: `t` runs along the fence, `depth` into the yard. A thing built with its length along x
 * and its front toward +z, turned by `turn`, then lies along the fence and faces the yard.
 * t runs west to east on the north side, east to west on the south, south to north on the west, north to south on the east.
 */
export function sideOf(b, side) {
  const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
  if (side === 'n') return { side, len: W, turn: 0, at: (t, d) => [b.minX + t, b.minZ + d], along: t => b.minX + t, t: c => c - b.minX };
  if (side === 's') return { side, len: W, turn: Math.PI, at: (t, d) => [b.maxX - t, b.maxZ - d], along: t => b.maxX - t, t: c => b.maxX - c };
  if (side === 'w') return { side, len: D, turn: Math.PI / 2, at: (t, d) => [b.minX + d, b.maxZ - t], along: t => b.maxZ - t, t: c => b.maxZ - c };
  return { side, len: D, turn: -Math.PI / 2, at: (t, d) => [b.maxX - d, b.minZ + t], along: t => b.minZ + t, t: c => c - b.minZ };
}
/** The ground between t1 and t2 along a side, from depth d1 to d2, as a rectangle. */
function stripRect(f, t1, t2, d1, d2) {
  const [x1, z1] = f.at(t1, d1), [x2, z2] = f.at(t2, d2);
  return { minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2) };
}
const overlap = (a, b, pad = 0) => a.maxX + pad > b.minX && a.minX - pad < b.maxX && a.maxZ + pad > b.minZ && a.minZ - pad < b.maxZ;
const touches = (r, c, pad = 0) => Math.hypot(c.x - Math.max(r.minX, Math.min(r.maxX, c.x)), c.z - Math.max(r.minZ, Math.min(r.maxZ, c.z))) < c.r + pad;

// ------------------------------------------------------------------------------------------ fences and lamps
/** The sides of a yard that it fences itself: a side shared with a yard that opens earlier was fenced by that one (as js/area.js does). */
export function fencedSides(cfg, areas = AREAS) {
  const b = cfg.bounds, eps = 0.01, earlier = areas.slice(0, areas.findIndex(a => a.id === cfg.id));
  const shared = side => earlier.some(o => {
    const c = o.bounds;
    const xOverlap = Math.min(b.maxX, c.maxX) - Math.max(b.minX, c.minX) > eps, zOverlap = Math.min(b.maxZ, c.maxZ) - Math.max(b.minZ, c.minZ) > eps;
    if (side === 'n') return Math.abs(c.maxZ - b.minZ) < eps && xOverlap;
    if (side === 's') return Math.abs(c.minZ - b.maxZ) < eps && xOverlap;
    if (side === 'w') return Math.abs(c.maxX - b.minX) < eps && zOverlap;
    return Math.abs(c.minX - b.maxX) < eps && zOverlap;
  });
  const ends = { n: [b.minX, b.minZ, b.maxX, b.minZ], s: [b.minX, b.maxZ, b.maxX, b.maxZ], w: [b.minX, b.minZ, b.minX, b.maxZ], e: [b.maxX, b.minZ, b.maxX, b.maxZ] };
  return SIDES.filter(s => !shared(s)).map(side => { const [x1, z1, x2, z2] = ends[side]; return { side, x1, z1, x2, z2 }; });
}

/**
 * Where the lamp posts of a yard stand: two to a fenced side, a quarter of the way in from each corner, moved clear of
 * a gate where one would stand in it.
 * @param sides  [{ side, x1, z1, x2, z2 }] the sides this yard fences
 * @param gates  [{ side, at }] the openings in them
 * @param clear  how far from the middle of an opening a lamp must keep
 * @returns [{ side, x, z, nx, nz, at }]  (nx, nz) points into the yard; `at` is its place along the fence
 */
export function lampPlan(bounds, sides, gates, clear) {
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2, out = [];
  for (const { side, x1, z1, x2, z2 } of sides) {
    const alongX = side === 'n' || side === 's';
    for (const t of [0.25, 0.75]) {
      let x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      for (const gate of [].concat(gates || [])) {   // one gate or several: a lamp never stands in an opening
        if (!gate || gate.side !== side) continue;
        const along = alongX ? x : z, off = along - gate.at;
        if (Math.abs(off) < clear) { const moved = gate.at + (off < 0 ? -clear : clear); if (alongX) x = moved; else z = moved; }
      }
      out.push({ side, x, z, nx: alongX ? 0 : Math.sign(cx - x), nz: alongX ? Math.sign(cz - z) : 0, at: alongX ? x : z });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------ what to keep clear
/**
 * The ground of a yard that nothing may stand on.
 * @param lamps  where its lamp posts stand, as stretches of fence [{ side, at }]; worked out here when not given
 * @returns {{ gaps, rects, rounds, openings, parks, north }}
 *   gaps: stretches of fence [{ side, at, half, deep }] (deep: how far into the yard the stretch is kept clear)
 *   rects, rounds: ground inside the yard: machines and shops with the room around them; piles and plots
 *   openings: the gates themselves [{ side, at, half, out }] (out: true where people leave by it)
 *   parks: where trucks stand while they load: things keep off it, paint does not
 *   north: true when another yard lies behind this one
 */
export function yardKeepouts(cfg, { areas = AREAS, lamps = null, gateHalf = GATE } = {}) {
  const b = cfg.bounds, g = cfg.gate, gaps = [], rects = [], rounds = [], openings = [], parks = [];
  const from = areas.find(o => o.gate && o.gate.next === cfg.id), wayIn = from ? { side: ACROSS[from.gate.side], at: from.gate.at } : null;
  const way = SITE.gate.yard === cfg.id ? SITE.gate : null;
  lamps ||= lampPlan(b, fencedSides(cfg, areas), [g, way].filter(Boolean), gateHalf + 2.4);
  for (const l of lamps) gaps.push({ side: l.side, at: l.at, half: l.half ?? 0.9, deep: 1.3 });                    // nothing stands in a lamp post
  if (g) { gaps.push({ side: g.side, at: g.at, half: gateHalf + 2.8 }); openings.push({ side: g.side, at: g.at, half: gateHalf, out: true }); }   // the gate and its signpost
  if (wayIn) { gaps.push({ ...wayIn, half: gateHalf + 2.9 }); openings.push({ ...wayIn, half: gateHalf, out: false }); }   // the open leaves of that gate fold back along this side
  if (way) { gaps.push({ side: way.side, at: way.at, half: way.half + 2.8 }); openings.push({ side: way.side, at: way.at, half: way.half, out: true }); }   // the way to the building site and its signpost
  const stations = [...cfg.stations, ...cfg.upgrades.filter(u => u.effect?.type === 'station').map(u => u.effect.station)];   // built or not
  const M = 0.95;   // people and trucks go around a machine 0.8 away from it
  for (const s of stations) {
    if (s.type === 'processor') {
      rects.push({ minX: s.x - 3.5 - M, maxX: s.x + 3.5 + M, minZ: s.z - 1.4 - M, maxZ: s.z + 3.9 + M });
      if (s.z - b.minZ < 6.5) gaps.push({ side: 'n', at: s.x, half: 4.0 });   // behind the machine, where its name floats
      parks.push({ minX: s.x + 5.4 - 0.9, maxX: s.x + 5.4 + 0.9, minZ: s.z + 0.6, maxZ: s.z + 4.6 });   // where a truck stops beside the end of its belt (js/trucks.js, STOP)
    } else if (s.type === 'shop') {
      rects.push({ minX: s.x - 3.4, maxX: s.x + 3.4, minZ: s.z - 2.2, maxZ: s.z + 3.7 });
      if (b.maxZ - s.z < 7) gaps.push({ side: 's', at: s.x, half: 3.6 });   // behind the shop's sign
      for (const side of ['w', 'e']) gaps.push({ side, at: s.z + 2.3, half: 1.3 });   // customers come in along the counter's row, from either edge
    } else if (s.type === 'source') {
      rounds.push({ x: s.x, z: s.z, r: s.pile === 'field' ? 2.95 : 2.75 });   // the pile itself: people take from it on the side they come from, the yard's side
      if (s.prop === 'mound') rects.push({ minX: s.x - 4.2, maxX: s.x + 4.2, minZ: s.z - 5, maxZ: s.z });
      if (s.prop !== 'none' && s.z - b.minZ < 7) gaps.push({ side: 'n', at: s.x, half: s.prop === 'mound' ? 4.8 : 2.4 });   // a rock or a derrick reaches the fence
    }
  }
  for (const u of cfg.upgrades) if (u.plot) rounds.push({ x: u.plot[0], z: u.plot[1], r: 2.5 });
  if (g) { const gg = gateGeom(b, g); rounds.push({ x: gg.x - gg.nx * 2.8, z: gg.z - gg.nz * 2.8, r: 2.5 }); }   // where the gate is paid for
  if (cfg.workerSpawn) rounds.push({ x: cfg.workerSpawn[0] + 0.75, z: cfg.workerSpawn[1], r: 1.8 });
  const north = areas.some(o => o !== cfg && Math.abs(o.bounds.maxZ - b.minZ) < 0.01 && Math.min(b.maxX, o.bounds.maxX) - Math.max(b.minX, o.bounds.minX) > 0.01);
  return { gaps, rects, rounds, openings, parks, north };
}

// ------------------------------------------------------------------------------------------ the plan
/**
 * Everything that dresses a yard.
 * @param cfg   the yard, from the data file
 * @param opts  { areas, lamps, gateHalf }: see yardKeepouts
 * @returns {{ props, quads, rings, lights, tris }}
 *   props:  [{ kind, side, x, z, turn, flip, tint, rect, h }]  (x, z): the middle of its back; rect: the ground it stands on
 *   quads:  flat paint on the floor, [x, z, w, d, turn, colour]: w along its own x, d along its own z, turned about its middle
 *   rings:  flat rings on the floor (r0 = 0 for a disc), [x, z, r0, r1, colour]
 *   lights: pools of light for the night, [{ x, z, size }]
 *   tris:   the triangles of all the props, from the catalogue
 */
export function yardDressing(cfg, opts = {}) {
  const b = cfg.bounds, dress = lookOf(cfg).dress, keep = yardKeepouts(cfg, opts);
  let seed = 29; for (const ch of cfg.id) seed = seed * 31 + ch.charCodeAt(0) | 0;
  const rnd = mulberry(seed), pick = list => list[Math.floor(rnd() * list.length * 0.999)];
  const F = Object.fromEntries(SIDES.map(s => [s, sideOf(b, s)]));
  const blocked = keep.gaps.map(g => { const f = F[g.side], t = f.t(g.at); return stripRect(f, t - g.half, t + g.half, 0, g.deep ?? CORNER); });
  const props = [], count = {};
  let tris = 0;

  /** How tall a thing may be at `t` along a side: low toward the camera, taller toward the back. */
  const roof = (side, t) => {
    if (side === 's') return FRONT;
    if (side === 'n') return keep.north ? 3.6 : 9;   // behind the yard to the north stands its shop: not much taller than its sign
    const fromSouth = side === 'w' ? t : F[side].len - t;   // t runs south to north on the west side, north to south on the east
    return fromSouth < F[side].len * 0.42 ? LOW : 2.9;
  };
  /** Stand a thing with the middle of its length at `t` along a side, if the ground is free there. */
  const place = (kind, side, t, corner = false) => {
    const f = F[side], p = size(kind);
    if (t - p.w / 2 < 0.3 || t + p.w / 2 > f.len - 0.3 || tris + p.tris > BUDGET) return false;
    if (INSET + p.d > (corner ? CORNER : REACH) + 1e-6) return false;
    // a mast or a pole is thin enough to stand tall at the back; toward the camera everything keeps low
    const most = Math.min(roof(side, t - p.w / 2), roof(side, t + p.w / 2));
    if (p.h > most && !(p.flags.includes('t') && most > LOW)) return false;
    const rect = stripRect(f, t - p.w / 2, t + p.w / 2, INSET, INSET + p.d);
    if (blocked.some(r => overlap(rect, r)) || keep.rects.some(r => overlap(rect, r)) || keep.parks.some(r => overlap(rect, r)) || keep.rounds.some(c => touches(rect, c))) return false;
    if (props.some(o => overlap(rect, o.rect, 0.14))) return false;
    const [x, z] = f.at(t, INSET), tints = dress.tints?.[kind] || TINTS[kind];
    props.push({ kind, side, x, z, turn: f.turn, flip: rnd() < 0.5, tint: tints ? pick(tints) : null, rect, h: p.h });
    count[kind] = (count[kind] || 0) + 1; tris += p.tris;
    return true;
  };

  // The big pieces first, at the back of the yard: in a back corner when they are made for one, else wherever along the
  // north fence there is room nearest the middle of what the camera shows, else on the west or the east toward the back.
  for (const kind of dress.hero || []) {
    const p = size(kind), n = F.n;
    if (p.flags.includes('c')) { place(kind, 'n', n.len - p.w / 2 - 0.35, true) || place(kind, 'n', p.w / 2 + 0.35, true); continue; }
    const aim = n.len * 0.36;
    const spots = []; for (let t = p.w / 2 + 0.3; t < n.len - p.w / 2 - 0.3; t += 0.1) spots.push(t);
    spots.sort((u, v) => Math.abs(u - aim) - Math.abs(v - aim));
    if (spots.some(t => place(kind, 'n', t))) continue;
    for (const side of ['w', 'e']) {
      const f = F[side]; let done = false;
      for (let k = 0.5; k < f.len * 0.45 && !done; k += 0.4) done = place(kind, side, side === 'w' ? f.len - p.w / 2 - k : p.w / 2 + k);
      if (done) break;
    }
  }

  // Then the things of the trade and the small things, side by side along each fence: the back first, where they are
  // seen best, then the two sides, then a few low ones on the camera's side. The trade's own things lead each deck, so
  // every one of them stands somewhere before any comes twice.
  const shuffled = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const trade = dress.trade || [], filler = dress.filler || [];
  const fill = (side, deck, gap, spread, most) => {
    const f = F[side];
    let t = 0.35 + rnd() * 0.5, last = null, put = 0;
    while (t < f.len - 0.5 && deck.length && put < most) {
      // the first thing in the deck that fits here; one that does not waits for a wider place further along
      const i = deck.findIndex(kind => kind !== last && (count[kind] || 0) < (trade.includes(kind) ? 2 : 3) && place(kind, side, t + size(kind).w / 2));
      if (i < 0) { t += 0.35; continue; }
      last = deck[i]; put++;
      t += size(last).w + gap + rnd() * spread;
      deck.splice(i, 1);
    }
  };
  const waiting = () => trade.filter(k => !count[k]);
  fill('n', [...waiting(), ...shuffled([...trade, ...filler])], 0.35, 1.3, 9);
  const first = rnd() < 0.5 ? 'w' : 'e', second = first === 'w' ? 'e' : 'w';
  fill(first, [...waiting(), ...shuffled([...filler, ...trade, ...filler])], 0.6, 2.2, 7);
  fill(second, [...waiting(), ...shuffled([...filler, ...trade, ...filler])], 0.6, 2.2, 7);
  fill('s', [...waiting(), ...shuffled([...filler, ...filler, ...trade])], 1.4, 3.4, 4);

  // What grows or lies at the foot of the fence, between the things.
  if (dress.verge?.length) {
    const gates = keep.openings.map(o => ({ side: o.side, at: o.at, half: o.half + 0.5 }));
    for (const s of fenceSpots(b, gates, 34, rnd, INSET + 0.08)) {
      const kind = pick(dress.verge), p = size(kind), far = 0.1 + rnd() * 0.35, tints = dress.tints?.[kind] || TINTS[kind];
      const x = s.x + (s.side === 'w' ? far : s.side === 'e' ? -far : 0), z = s.z + (s.side === 'n' ? far : s.side === 's' ? -far : 0);
      const rect = { minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 };
      if (tris + p.tris > BUDGET || props.some(o => overlap(rect, o.rect, 0.05)) || keep.rects.some(r => overlap(rect, r))) continue;
      props.push({ kind, side: s.side, x, z, turn: rnd() * 6.283, flip: false, tint: tints ? pick(tints) : null, rect, h: p.h, scale: 0.8 + rnd() * 0.5 });
      tris += p.tris;
    }
  }

  // Lamps among the things throw a pool of light at night: three to a yard at most, none close to another.
  const lit = props.filter(o => size(o.kind).flags.includes('l')).map(o => {
    const f = F[o.side], d = size(o.kind).d, [x, z] = f.at(f.t(o.side === 'n' || o.side === 's' ? o.x : o.z), INSET + d + 0.5);
    return { x, z, size: 6.5 };
  });
  const lights = [];
  for (const l of lit) if (lights.length < 3 && !lights.some(o => Math.hypot(o.x - l.x, o.z - l.z) < 5)) lights.push(l);

  const paint = floorPaint(cfg, dress, keep, F, props, rnd);
  return { props, quads: paint.quads, rings: paint.rings, lights, tris };
}

// ------------------------------------------------------------------------------------------ paint on the floor
const WOOD = [0xb98d57, 0xa87c4a, 0xc49a63], STONE = [0xb9bbb6, 0xa9aba6, 0xc6c8c2], IRON = 0x2f3338, CAST = 0x565b63;

/**
 * What is laid or painted flat on a yard's floor, by the yard's `floor`:
 *   boards  a boardwalk of planks in every gate (the wooden yards of the town)
 *   slabs   a threshold of stone slabs in every gate (the walled yards)
 *   paint   factory floor paint: a yellow line around the floor that keeps the storage strip apart, hatched boxes and
 *           arrows at the gates, manhole covers and drains (Industrial City)
 *   plaza   a zebra crossing, a strip of studs and arrows at the gates, a thin coloured line and one cover (the Metropolis)
 * Nothing is painted under a machine, a shop, a pile or a plot, and no two pieces lie on top of each other in
 * different colours (they are all in one flat sheet, so they would flicker).
 */
function floorPaint(cfg, dress, keep, F, props, rnd) {
  const b = cfg.bounds, quads = [], rings = [], kind = dress.floor, line = dress.line ?? 0xf2b630;
  const quad = (f, t, depth, w, d, color, turn = 0) => { const [x, z] = f.at(t, depth); quads.push([x, z, w, d, f.turn + turn, color]); };
  for (const o of keep.openings) {
    const f = F[o.side], t0 = f.t(o.at), wide = o.half * 2 - 0.35;
    if (kind === 'boards') {
      for (let i = 0; i < 5; i++) quad(f, t0 + (rnd() - 0.5) * 0.24, 0.3 + i * 0.36, wide - rnd() * 0.3, 0.3, WOOD[i % 3]);
    } else if (kind === 'slabs') {
      for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) quad(f, t0 - wide / 2 + (i + 0.5) * wide / 4 + (row ? 0.18 : -0.1), 0.62 + row * 0.82, wide / 4 - 0.1, 0.72, STONE[(i + row * 2) % 3]);
    } else if (kind === 'paint') {
      // a hatched box: keep clear. Its frame, and slanted bars inside it
      const d0 = 0.3, d1 = 1.9, half = wide / 2;
      quad(f, t0, d0, wide, 0.1, line); quad(f, t0, d1, wide, 0.1, line);
      quad(f, t0 - half, (d0 + d1) / 2, 0.1, d1 - d0, line); quad(f, t0 + half, (d0 + d1) / 2, 0.1, d1 - d0, line);
      for (let u = -half + 0.75; u < half - 0.7; u += 0.72) quad(f, t0 + u, (d0 + d1) / 2, 0.13, 1.9, line, Math.PI / 4);
      for (const depth of [2.75, 3.5]) chevron(quad, f, t0, depth, o.out ? 1 : -1, line);
    } else if (kind === 'plaza') {
      // a zebra crossing: dark and light bars side by side, a line at each end of it, and a strip of studs before it
      const bars = 9, w = wide / bars;
      for (let i = 0; i < bars; i++) quad(f, t0 - wide / 2 + (i + 0.5) * w, 1.1, w, 1.5, i % 2 ? 0x3d4652 : 0xf2f5f8);
      quad(f, t0, 0.27, wide, 0.09, line); quad(f, t0, 1.93, wide, 0.09, line);
      for (let i = 0; i < 9; i++) quad(f, t0 - wide / 2 + (i + 0.5) * wide / 9, 2.35, 0.24, 0.24, 0xf2c230);
      chevron(quad, f, t0, 3.2, o.out ? 1 : -1, line);
    }
  }
  if (kind !== 'paint' && kind !== 'plaza') return { quads, rings };

  // The line around the floor, LINE inside the fence, left out wherever something is in its way.
  const stops = [...keep.rects, ...props.filter(o => o.rect.maxX - o.rect.minX > 0.7).map(o => o.rect)];
  const dots = [...keep.rounds.map(c => ({ ...c, r: Math.min(c.r, 3.6) - 0.5 }))];
  const width = kind === 'paint' ? 0.13 : 0.09;
  for (const side of SIDES) {
    const f = F[side], step = 0.25;
    const free = t => {
      const [x, z] = f.at(t, LINE), p = { minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 };
      if (keep.openings.some(o => o.side === side && Math.abs(f.along(t) - o.at) < o.half + 0.25)) return false;
      return !stops.some(r => overlap(p, r)) && !dots.some(c => Math.hypot(c.x - x, c.z - z) < c.r);
    };
    let from = null;
    for (let t = LINE; t <= f.len - LINE + 1e-6; t += step) {
      const ok = free(t);
      if (ok && from === null) from = t;
      if ((!ok || t + step > f.len - LINE + 1e-6) && from !== null) {
        const to = ok ? t : t - step;
        if (to - from >= 1) quad(f, (from + to) / 2, LINE, to - from + width, width, line);   // half a width more at each end: the corners close
        from = null;
      }
    }
  }

  // Covers and drains in the open floor, clear of everything that has its own marks.
  const open = (x, z, pad) => !keep.rects.some(r => overlap({ minX: x - pad, maxX: x + pad, minZ: z - pad, maxZ: z + pad }, r)) && !keep.rounds.some(c => Math.hypot(c.x - x, c.z - z) < c.r + pad - 0.4);
  const covers = kind === 'paint' ? 2 : 1, spots = [];
  for (let i = 0; i < 40 && spots.length < covers; i++) {
    const x = b.minX + 3.4 + rnd() * (b.maxX - b.minX - 6.8), z = b.minZ + 3.4 + rnd() * (b.maxZ - b.minZ - 6.8);
    if (!open(x, z, 1.0) || spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 7)) continue;
    spots.push([x, z]);
    rings.push([x, z, 0.4, 0.5, IRON], [x, z, 0.22, 0.4, CAST], [x, z, 0.14, 0.22, IRON], [x, z, 0, 0.14, CAST]);
  }
  if (kind === 'paint') {   // drains: a grating of bars beside the line, on the two long sides
    for (const side of ['w', 'e']) {
      const f = F[side];
      for (let i = 0; i < 12; i++) {
        const t = 4 + rnd() * (f.len - 8), [x, z] = f.at(t, LINE + 0.55);
        if (!open(x, z, 0.9) || keep.openings.some(o => o.side === side && Math.abs(f.along(t) - o.at) < o.half + 1.5)) continue;
        for (let k = 0; k < 7; k++) quad(f, t - 0.3 + k * 0.1, LINE + 0.55, 0.1, 0.46, k % 2 ? 0x8a9099 : IRON);
        break;
      }
    }
  }
  return { quads, rings };
}

/** An arrow head on the floor at `t` along a side: two bars that meet at its point, toward the fence (way = 1) or away from it. */
function chevron(quad, f, t, depth, way, color) {
  for (const s of [-1, 1]) quad(f, t + s * 0.31, depth, 0.95, 0.17, color, -s * way * 0.7);
}
