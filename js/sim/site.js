// What stands where on the building site and around the city, worked out as plain numbers: no drawing here.
// js/site.js and js/gfx/cityedge.js turn these lists into shapes; tests/site.test.mjs checks them without a screen.
import { AREAS } from '../data/areas.js';
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

// ------------------------------------------------------------------------------------------ the city's edge
/**
 * The street that runs around the cities, measured out from a yard's fence: a paved verge, the carriageway, a kerb,
 * and then the pavement the buildings stand on. `band` is how wide the built-up strip is in all.
 */
export const STREET = { verge: 0.55, road: 2.7, kerb: 0.14, band: 12 };

/**
 * How high things may stand. The camera sits south of and above the player it looks at: 17 up for every 11.5 back,
 * at any zoom (updateCamera in js/world.js). So whatever stands south of the yards hides the ground north of it, as
 * far as its height divided by that slope. Nothing there may hide more than `inside` of a yard along its south fence
 * (the player stops 0.8 inside it), nor reach over `top`: the camera of a tablet zoomed all the way in passes 10.5
 * above the ground. Beside the yards, where the camera never is, the limit is `side`.
 */
export const SIGHT = { slope: 17 / 11.5, inside: 0.4, top: 8, side: 9 };

/**
 * What stands along the street: [length along the street, depth across it, height], as js/gfx/cityedge.js draws it.
 * A thing faces the road; one that is turned a quarter stands with its length across the street. A tree's measure is its
 * planter and a lamp's its post: the crown and the lamp's arm reach further, high over what stands beside them.
 * After changing a shape, read what it measures with measureCityEdge() in js/gfx/cityedge.js and put it in here.
 */
export const EDGE_THINGS = {
  lamp: [0.3, 0.3, 3.2], flood: [0.4, 0.4, 4.2], tree: [1.1, 1.1, 2.8], bench: [1.3, 0.5, 0.8], bin: [0.4, 0.4, 0.75], bollard: [0.2, 0.2, 0.7],
  hydrant: [0.35, 0.3, 0.65], planter: [1.4, 0.5, 0.8], cafe: [1.3, 1.3, 1.7], kiosk: [1.5, 1.2, 2], shelter: [2.3, 0.95, 1.75], mailbox: [0.4, 0.4, 0.95],
  car: [1, 1.95, 0.85], truck: [1.25, 3.1, 1.65], containers: [2.5, 1.1, 2.15], tanks: [3.2, 1.7, 2.8], drums: [0.95, 0.95, 0.85],
  barrier: [2.5, 0.35, 0.95], cone: [0.25, 0.25, 0.45], hut: [1.4, 1.4, 2], plinth: [2.2, 2.2, 0.5],
};
/** What stands on a roof, and how high it reaches over it. Its footprint is the room it is given. */
export const ROOF_THINGS = {
  ac: 0.55, solar: 0.5, stair: 0.95, skylight: 0.25, antenna: 2, helipad: 0.1, sign: 0.85, vent: 0.6, garden: 1.5, pool: 1.5, tank: 1.75,
  tankH: 0.9, pipes: 0.45, cooler: 0.6, tankV: 1.5, flue: 1.5, deck: 0.9, sawtooth: 0.8, gable: 0.9, billboard: 2.3,
};
/** How high the hedge or the wall around the outside of the paving stands, at most. */
export const RIM_TOP = 0.95;
/** The rim around a flat roof. */
export const PARAPET = 0.3;
/** The kinds of building, in the order a row hands them out: factories and warehouses beside the city, offices, flats and shops around the Metropolis. */
const KINDS = {
  city: { s: ['warehouse', 'factory', 'plant'], w: ['factory', 'warehouse', 'plant'], e: ['plant', 'factory', 'warehouse'] },
  metropolis: { s: ['office', 'flats', 'garage', 'office', 'hotel', 'flats'], w: ['hotel', 'office', 'flats', 'office'], e: ['office', 'flats', 'hotel', 'garage'] },
};
const SHOP_UNDER = 3.4;   // in the Metropolis, a building lower than this is a shop
/** How far the front of a building reaches over the pavement (an awning, a canopy, a loading dock): nothing is stood under it. */
const FRONT = { shop: 0.95, hotel: 1.1, office: 0.8, warehouse: 0.8, plant: 0.55, factory: 0.15, flats: 0.3, garage: 0.15 };
const PAINT = { white: 0xf2f2f2, yellow: 0xf2c230, bay: 0x4b5058, drain: 0x2c3036, carpet: 0xb23a48 };

const boundsOf = rects => ({ minX: Math.min(...rects.map(r => r.minX)), maxX: Math.max(...rects.map(r => r.maxX)), minZ: Math.min(...rects.map(r => r.minZ)), maxZ: Math.max(...rects.map(r => r.maxZ)) });
/** The location of a yard given as a rectangle: its own, or that of the yard with these bounds in the data. */
const locationOf = r => r.location || AREAS.find(a => a.bounds.minX === r.minX && a.bounds.minZ === r.minZ && a.bounds.maxX === r.maxX && a.bounds.maxZ === r.maxZ)?.location || 'city';
/** The most a thing may reach up, standing with its north edge at zNorth (SIGHT). */
const sightTop = (b, zNorth) => (zNorth >= b.maxZ ? Math.min(SIGHT.top, SIGHT.slope * (zNorth - b.maxZ + SIGHT.inside)) : SIGHT.side);

/**
 * What stands around Industrial City and the Metropolis. A street runs along the yards' fences on three sides, and
 * behind it stand the buildings: factories, warehouses and two striped chimneys beside the city; offices, shops and
 * flats around the Metropolis, with what belongs on their roofs and on the pavement in front of them.
 *
 * Everything is plain numbers drawn from fixed seeds, so the map is the same on every device. The buildings come
 * from the same run of numbers as before the building site existed, each is dressed from a run of its own, and those
 * on a `clear` rectangle are left out afterwards: the others stay exactly as they were. A chimney that would stand in
 * front of a `clear` rectangle moves to the north end of its side. The street and what stands along it are laid out
 * last, around the buildings that are left, and keep off the `clear` ground.
 * @param rects  the yards the edge goes around ({ minX, maxX, minZ, maxZ }, and `location` if it is not a yard of the data)
 * @param clear  rectangles of ground to keep free (the building site's plot)
 * @returns {{ slabs, buildings, chimneys, roads, paving, kerbs, marks, covers, props, rims }}
 *   slabs     [x0, x1, z0, z1] the asphalt under it all: south, west, east
 *   buildings { x, z, w, d, h, wall, roof, vx, vz, side, where, kind, tint, tier?, wing?, kit, top }
 *             side: its row ('s', 'w', 'e'); where: 'city' or 'metropolis'; wall, roof, tint: which of five colours;
 *             tier: a smaller block on top; wing: a lower one at its end (each { x, z, w, d, h });
 *             kit: what stands on its roofs [{ kind, x, z, w, d, y, h, face? }] (ROOF_THINGS); top: how high it reaches in all
 *   chimneys  [x, z]
 *   roads     [x0, x1, z0, z1] the carriageways
 *   paving    [x0, x1, z0, z1, where] the pavements: every part of a slab that is not carriageway
 *   kerbs     [x0, x1, z0, z1] the kerb stones, in pieces
 *   marks     [x, z, w, d, turn, colour, layer] paint on the ground: lane lines, crossings, parking bays (layer 0: a surface, 1: a line on it)
 *   covers    [x, z, r] manhole covers
 *   props     { kind, x, z, turn, tint, where } what stands along the street (EDGE_THINGS)
 *   rims      [x0, x1, z0, z1, where] the outer edge of the paving, in pieces: a hedge (the Metropolis) or a wall (the city), RIM_TOP high at most
 */
export function cityEdge(rects, clear = []) {
  const rnd = mulberry(41);
  const b = boundsOf(rects);
  const W = STREET.band;   // width of the asphalt band
  const slabs = [[b.minX - W, b.maxX + W, b.maxZ, b.maxZ + W], [b.minX - W, b.minX, b.minZ, b.maxZ], [b.maxX, b.maxX + W, b.minZ, b.maxZ]];   // south, west, east
  const all = [];
  const building = (side, x, z, w, d, h) => {
    const wall = Math.floor(rnd() * 5), roof = Math.floor(rnd() * 5);
    all.push({ x, z, w, d, h, wall, roof, vx: x + (rnd() - 0.5) * (w - 1.6), vz: z + (rnd() - 0.5) * (d - 1.6), side });   // vx, vz: where the one vent of a roof used to stand
  };
  for (let x = b.minX - 7; x < b.maxX + 8; x += 6.5 + rnd() * 3) building('s', x, b.maxZ + 6 + rnd() * 3.5, 4 + rnd() * 2, 4 + rnd() * 1.5, 2.6 + rnd() * 3.2);
  for (let z = b.minZ + 4; z < b.maxZ; z += 7 + rnd() * 3) {
    building('w', b.minX - 6 - rnd() * 3, z, 4 + rnd() * 1.5, 4 + rnd() * 2, 3 + rnd() * 3.5);
    building('e', b.maxX + 6 + rnd() * 3, z, 4 + rnd() * 1.5, 4 + rnd() * 2, 3 + rnd() * 3.5);
  }
  // What each building is and what it carries, from a run of numbers of its own: the same whatever ground is kept free.
  const located = rects.map(r => ({ r, where: locationOf(r) }));
  const whereAt = (x, z) => located.reduce((best, o) => {
    const far = Math.hypot(Math.max(o.r.minX - x, 0, x - o.r.maxX), Math.max(o.r.minZ - z, 0, z - o.r.maxZ));
    return far < best.far ? { far, where: o.where } : best;
  }, { far: Infinity, where: 'city' }).where;
  const turns = {};
  all.forEach((o, i) => {
    const where = whereAt(o.x, o.z), row = where + o.side, list = KINDS[where][o.side];
    const kind = where === 'metropolis' && o.h < SHOP_UNDER ? 'shop' : list[(turns[row] = (turns[row] ?? -1) + 1) % list.length];
    const next = all.find((q, k) => k > i && q.side === o.side);   // the next one along its row
    dressBuilding(o, i, { where, kind, top: zNorth => sightTop(b, zNorth), nextAt: next ? (o.side === 's' ? next.x - next.w / 2 : next.z - next.d / 2) : null });
  });
  const stands = (o, r) => [o, o.wing].some(q => q && q.x + q.w / 2 + 0.4 > r.minX && q.x - q.w / 2 - 0.4 < r.maxX && q.z + q.d / 2 + 0.4 > r.minZ && q.z - q.d / 2 - 0.4 < r.maxZ);
  // A chimney that would stand between the camera and a `clear` rectangle (just south of it: the camera looks north) is put
  // at the north end of its side instead. A chimney and its smoke in front of the building site hid the house being built.
  const inFront = (x, z) => clear.some(r => x > r.minX - 2 && x < r.maxX + 2 && z > r.maxZ && z - r.maxZ < 10);
  const chimneys = [[b.minX - 9.5, b.maxZ + 3], [b.maxX + 9.5, b.maxZ + 3]].map(([x, z]) => (inFront(x, z) ? [x, b.minZ - 3] : [x, z]));
  const buildings = all.filter(o => !clear.some(r => stands(o, r)));
  return { slabs, buildings, chimneys, ...streetPlan({ b, rects, clear, slabs, buildings, chimneys, whereAt }) };
}

/**
 * What a building of the edge is and carries: a wing where the next building leaves room, a second block on an
 * office, and the things on its roofs, in rows. Whatever would reach over the camera's line of sight is left out.
 * @param o  the building as it was drawn from the common run of numbers: { x, z, w, d, h, side }
 * @param c  where: its location; kind; top(zNorth): how high a thing may reach there; nextAt: where the next building of its row begins
 */
function dressBuilding(o, i, { where, kind, top, nextAt }) {
  const r = mulberry(4100 + 13 * i), south = o.side === 's';
  const n = south ? [0, -1] : o.side === 'w' ? [1, 0] : [-1, 0];   // toward the street
  const across = south ? o.d : o.w, end = south ? o.x + o.w / 2 : o.z + o.d / 2;
  o.where = where; o.kind = kind; o.tint = Math.floor(r() * 5);
  const kit = [];
  /** A thing on a roof, in the room w by d around (x, z), standing at height y: left out where it would be seen over. */
  const put = (what, x, z, w, d, y, more) => { if (w > 0.35 && d > 0.35 && y + ROOF_THINGS[what] <= top(z - d / 2) + 1e-9) kit.push({ kind: what, x, z, w, d, y, h: ROOF_THINGS[what], ...more }); };

  const gap = nextAt == null ? 0 : nextAt - end;
  if (gap >= 2.2 && gap < 3.25) {   // too narrow for parking, wide enough to build on
    const len = Math.min(1.8, gap - 1.1), deep = across * (0.55 + r() * 0.25), tall = Math.max(1.9, o.h * (0.45 + r() * 0.2)), k = (across - deep) / 2 * (r() < 0.5 ? -1 : 1);
    o.wing = south ? { x: end + len / 2, z: o.z + n[1] * k, w: len, d: deep, h: tall } : { x: o.x + n[0] * k, z: end + len / 2, w: deep, d: len, h: tall };
    put(where === 'city' ? (r() < 0.5 ? 'flue' : 'vent') : 'ac', o.wing.x, o.wing.z, Math.min(o.wing.w - 0.3, 1), Math.min(o.wing.d - 0.3, 1), tall);
  }
  if (kind === 'office') {   // a second, smaller block, set back from the street
    const w = o.w - 1.1, d = o.d - 1.1, x = o.x - n[0] * 0.25, z = o.z - n[1] * 0.25;
    const h = Math.min(1.6 + r() * (south ? 1.2 : 2.2), top(z - d / 2) - o.h - 1.6);   // 1.6: room for its rim and for what stands on it
    if (h >= 1.1) o.tier = { x, z, w, d, h };
  }
  const on = o.tier || o, y = o.h + (o.tier ? o.tier.h : 0);
  const Q = { x0: on.x - on.w / 2 + 0.4, x1: on.x + on.w / 2 - 0.4, z0: on.z - on.d / 2 + 0.4, z1: on.z + on.d / 2 - 0.4 };   // the roof inside its rim
  /** The roof in rows from north to south, each holding one kind of thing. */
  const rows = (types, start = 0) => {
    const count = Math.max(1, Math.min(3, Math.floor((Q.z1 - Q.z0) / 1.3))), deep = (Q.z1 - Q.z0) / count, mid = (Q.x0 + Q.x1) / 2, wide = Q.x1 - Q.x0;
    for (let k = 0; k < count; k++) {
      const type = types[(start + k) % types.length], z = Q.z0 + deep * (k + 0.5), end1 = r() < 0.5 ? -1 : 1;
      if (type === 'stair' || type === 'tank') {   // one at an end of the row, something else at the other
        const other = type === 'tank' ? 'stair' : kind === 'office' ? 'antenna' : 'vent', size = other === 'stair' ? 1.2 : 0.45;
        put(type, mid + end1 * (wide / 2 - 0.65), z, 1.2, Math.min(deep - 0.1, 1.2), y);
        put(other, mid - end1 * (wide / 2 - size / 2 - 0.05), z, size, Math.min(deep - 0.1, size), y);
        if (wide >= 3.6) put('ac', mid, z, wide - 2.7, deep - 0.35, y);
      } else if (type === 'pipes') {
        put('pipes', mid - end1 * 0.45, z, wide - 1.1, deep - 0.3, y); put('flue', mid + end1 * (wide / 2 - 0.35), z, 0.6, 0.6, y);
      } else put(type, mid, z, wide - 0.2, deep - 0.25, y);
    }
  };
  /** One large thing over most of the roof (a garden, a pool), and a row of smaller things beside it. */
  const terrace = (what, rest) => {
    const deep = Q.z1 - Q.z0, row = Math.min(1.35, deep * 0.4), north = r() < 0.5, mid = (Q.x0 + Q.x1) / 2, wide = Q.x1 - Q.x0;
    put(what, mid, north ? Q.z0 + (deep - row) / 2 : Q.z1 - (deep - row) / 2, wide - 0.2, deep - row - 0.2, y);
    if (north) Q.z0 = Q.z1 - row; else Q.z1 = Q.z0 + row;
    rows(rest);
  };
  if (kind === 'factory') put('sawtooth', o.x, o.z, o.w, o.d, y);
  else if (kind === 'warehouse') put('gable', o.x, o.z, o.w, o.d, y);
  else if (kind === 'garage') put('deck', on.x, on.z, Q.x1 - Q.x0, Q.z1 - Q.z0, y);
  else if (kind === 'plant') rows(['tankH', 'pipes', 'cooler', 'tankV'], Math.floor(r() * 4));
  else if (kind === 'office') {
    const pad = Math.min(Q.x1 - Q.x0, Q.z1 - Q.z0);
    if (o.tier && pad >= 2.9 && r() < 0.5) put('helipad', on.x, on.z, pad, pad, y);
    else rows(['ac', 'solar', 'stair', 'skylight'], Math.floor(r() * 4));
  } else if (kind === 'shop') {   // its sign along the edge over the street
    if (south) { put('sign', on.x, Q.z0 + 0.25, (Q.x1 - Q.x0) * 0.85, 0.5, y, { face: 'n' }); Q.z0 += 0.7; }
    else { put('sign', n[0] > 0 ? Q.x1 - 0.25 : Q.x0 + 0.25, on.z, 0.5, (Q.z1 - Q.z0) * 0.85, y, { face: n[0] > 0 ? 'e' : 'w' }); if (n[0] > 0) Q.x1 -= 0.7; else Q.x0 += 0.7; }
    rows(['skylight', 'ac', 'vent'], Math.floor(r() * 3));
  } else {   // flats and hotels: a garden or a pool on the roof, and a billboard toward whoever looks
    if (south && kind === 'hotel') { put('billboard', on.x, Q.z1 - 0.25, Math.min(3, Q.x1 - Q.x0), 0.5, y, { face: 's' }); Q.z1 -= 0.7; }
    if (!south && kind === 'flats') { put('billboard', n[0] > 0 ? Q.x1 - 0.25 : Q.x0 + 0.25, on.z, 0.5, Math.min(3, Q.z1 - Q.z0), y, { face: n[0] > 0 ? 'e' : 'w' }); if (n[0] > 0) Q.x1 -= 0.7; else Q.x0 += 0.7; }
    terrace(kind === 'hotel' ? 'pool' : 'garden', kind === 'hotel' ? ['ac'] : ['tank']);
  }
  o.kit = kit;
  o.top = Math.max(y + PARAPET, o.wing ? o.wing.h + 0.15 : 0, ...kit.map(k => k.y + k.h));
}

/** Cut the stretches `cuts` ([from, to]) out of the run from a to b, and what is left into pieces of at most `piece`. */
function runs(a, b, cuts, piece = 13) {
  let left = [[a, b]];
  for (const [c0, c1] of cuts) left = left.flatMap(([p, q]) => (c1 <= p || c0 >= q ? [[p, q]] : [[p, Math.min(q, c0)], [Math.max(p, c1), q]]));
  const out = [];
  for (const [p, q] of left) {
    if (q - p < 0.3) continue;
    const n = Math.ceil((q - p) / piece);
    for (let k = 0; k < n; k++) out.push([p + (q - p) * k / n, p + (q - p) * (k + 1) / n]);
  }
  return out;
}

/**
 * The street itself and what stands along it, around the buildings that are there: the carriageways, the pavements,
 * kerbs, paint, covers, and the lamps, trees, benches and parked vehicles. Each side is laid out in the street's own
 * measures (u along it, v out from the far edge of the carriageway) and then turned into the world.
 */
function streetPlan({ b, rects, clear, slabs, buildings, chimneys, whereAt }) {
  const { verge: V, road: RW, kerb: K, band: W } = STREET;
  const x1 = b.minX - V, x0 = x1 - RW, z0 = b.maxZ + V, z1 = z0 + RW, e0 = b.maxX + V, e1 = e0 + RW, zN = b.minZ + 0.6, east = b.maxX + W;
  // the road east of the yards stops short of ground that is kept free
  let eEnd = z1;
  for (const r of clear) if (r.maxX > e0 - 1 && r.minX < e1 + 1 && r.maxZ > zN && r.minZ < z1) eEnd = Math.min(eEnd, r.minZ - 1.6);
  const joined = eEnd >= z0, hasEast = eEnd - zN > 6;
  const roads = [[x0, x1, zN, z1], [x0, east, z0, z1]];
  if (hasEast) roads.push([e0, e1, zN, joined ? z1 : eEnd]);

  const rnd = mulberry(977);
  const kerbs = [], marks = [], covers = [], props = [], taken = [];
  const touch = (q, t, pad = 0) => q[0] < t[1] + pad && q[1] > t[0] - pad && q[2] < t[3] + pad && q[3] > t[2] - pad;
  const hit = (q, pad = 0) => taken.some(t => touch(q, t, pad));
  const onSlab = q => slabs.some(s => q[0] >= s[0] && q[1] <= s[1] && q[2] >= s[2] && q[3] <= s[3]);
  const kept = q => !clear.some(r => touch(q, [r.minX, r.maxX, r.minZ, r.maxZ], 0.3));
  for (const r of rects) taken.push([r.minX, r.maxX, r.minZ, r.maxZ]);
  for (const r of roads) taken.push(r);
  for (const o of buildings) for (const q of [o, o.wing]) if (q) taken.push([q.x - q.w / 2, q.x + q.w / 2, q.z - q.d / 2, q.z + q.d / 2]);
  const stand = (kind, x, z, turn, tint, q) => { taken.push(q); props.push({ kind, x, z, turn, tint, where: whereAt(x, z) }); };
  for (const [x, z] of chimneys) { const h = EDGE_THINGS.plinth[0] / 2; stand('plinth', x, z, 0, 0, [x - h, x + h, z - h, z + h]); }

  // The sides, each with its own measures: u runs along the street, v out from the carriageway's far edge (so the
  // carriageway is v from -RW to 0, and the buildings stand at v > 0). `turn` faces a thing toward the road.
  const sides = [
    { id: 's', from: x0, to: east, turn: 0, rect: (ua, ub, va, vb) => [ua, ub, z1 + va, z1 + vb], at: (u, v) => [u, z1 + v], local: o => ({ u0: o.x - o.w / 2, u1: o.x + o.w / 2, v0: o.z - o.d / 2 - z1, wing: o.wing ? o.wing.w : 0 }) },
    { id: 'w', from: zN, to: z1, turn: -Math.PI / 2, rect: (ua, ub, va, vb) => [x0 - vb, x0 - va, ua, ub], at: (u, v) => [x0 - v, u], local: o => ({ u0: o.z - o.d / 2, u1: o.z + o.d / 2, v0: x0 - (o.x + o.w / 2), wing: o.wing ? o.wing.d : 0 }) },
  ];
  if (hasEast) sides.push({ id: 'e', from: zN, to: joined ? z0 : eEnd, turn: Math.PI / 2, rect: (ua, ub, va, vb) => [e1 + va, e1 + vb, ua, ub], at: (u, v) => [e1 + v, u], local: o => ({ u0: o.z - o.d / 2, u1: o.z + o.d / 2, v0: o.x - o.w / 2 - e1, wing: o.wing ? o.wing.d : 0 }) });

  const lowBehind = [...rects, ...clear];
  /** How high a thing may reach where it stands: south of a yard or of ground kept free, no higher than the camera sees over. */
  const limit = q => {
    let top = sightTop(b, q[2]);
    for (const r of lowBehind) if (q[1] > r.minX && q[0] < r.maxX && q[2] >= r.maxZ) top = Math.min(top, SIGHT.top, SIGHT.slope * (q[2] - r.maxZ + SIGHT.inside));
    return top;
  };
  /** Stand a thing at (u, v) of a side if the ground is free. quarter: its length runs across the street; flip: it faces away; free: it may stand where others cannot (on a bay, on the road). */
  const place = (side, kind, u, v, { quarter = false, flip = false, tint = 0, pad = 0.12, free = false } = {}) => {
    const [len, deep, h] = EDGE_THINGS[kind], a = quarter ? deep : len, c = quarter ? len : deep;
    const q = side.rect(u - a / 2, u + a / 2, v - c / 2, v + c / 2);
    if (!onSlab(q) || !kept(q) || (!free && hit(q, pad)) || h > limit(q)) return false;
    const [x, z] = side.at(u, v);
    stand(kind, x, z, side.turn + (quarter ? Math.PI / 2 : 0) + (flip ? Math.PI : 0), tint, q);
    return true;
  };
  /** Paint on the ground of a side: lu long along the street and lv across it, its middle at (u, v). */
  const mark = (side, u, v, lu, lv, colour, layer = 1, turn = 0) => {
    const [xa, xb, za, zb] = side.rect(u - lu / 2, u + lu / 2, v - lv / 2, v + lv / 2);
    if (kept([xa, xb, za, zb])) marks.push([(xa + xb) / 2, (za + zb) / 2, xb - xa, zb - za, turn, colour, layer]);
  };
  /** A box painted on the ground, as four lines. */
  const frame = (side, ua, ub, va, vb, colour, t = 0.09) => {
    mark(side, (ua + ub) / 2, va + t / 2, ub - ua, t, colour); mark(side, (ua + ub) / 2, vb - t / 2, ub - ua, t, colour);
    mark(side, ua + t / 2, (va + vb) / 2, t, vb - va, colour); mark(side, ub - t / 2, (va + vb) / 2, t, vb - va, colour);
  };
  /** A box to keep clear: a yellow frame with a cross from corner to corner. */
  const hatch = (side, ua, ub, va, vb) => {
    frame(side, ua, ub, va, vb, PAINT.yellow);
    const [xa, xb, za, zb] = side.rect(ua, ub, va, vb), slant = Math.atan2(zb - za, xb - xa);
    if (kept([xa, xb, za, zb])) for (const turn of [slant, -slant]) marks.push([(xa + xb) / 2, (za + zb) / 2, Math.hypot(xb - xa, zb - za) - 0.25, 0.09, turn, PAINT.yellow, 1]);
  };

  for (const side of sides) {
    const south = side.id === 's';
    const cityAt = u => whereAt(...side.at(u, 1)) === 'city';
    const cuts = { outer: [], inner: [] };   // where the kerbs are let down: crossings, bays, drives

    // --- crossings: on the south street by its west end, where two yards meet, and by the way to the building site;
    //     on the streets at the ends, by the middle of each yard
    const along = rects.filter(r => (south ? r.maxZ === b.maxZ : side.id === 'w' ? r.minX === b.minX : r.maxX === b.maxX));
    const crossings = (south ? [b.minX + 1.65, ...along.map(r => r.minX).filter(x => x > b.minX), b.maxX + 1.1] : along.map(r => (r.minZ + r.maxZ) / 2))
      .filter(u => u > side.from + 1.5 && u < side.to - 1.5);
    const zebra = u => crossings.some(c => Math.abs(c - u) < 1.35);
    for (const u of crossings) {
      for (let k = 0; k < 4; k++) mark(side, u, -RW + 0.34 + k * 0.675, 1.5, 0.36, PAINT.white);
      cuts.outer.push([u - 0.95, u + 0.95]); cuts.inner.push([u - 0.95, u + 0.95]);
      taken.push(side.rect(u - 0.95, u + 0.95, 0, 1.3));   // the way off the crossing stays free
      for (const s of [-1, 1]) place(side, 'bollard', u + s * 1.12, 0.32, { tint: cityAt(u) ? 1 : 0, free: true });
    }

    if (side.id === 'w') place(side, 'hut', side.from + 1.1, 1.1);   // a gatehouse where the street begins

    // --- the buildings of this side, and the gaps between them
    const mine = buildings.filter(o => o.side === side.id).map(o => ({ o, ...side.local(o) })).filter(p => p.u1 + p.wing > side.from + 0.5 && p.u0 < side.to - 0.5).sort((p, q) => p.u0 - q.u0);
    for (const p of mine) taken.push(side.rect(p.u0, p.u1, Math.max(K, p.v0 - FRONT[p.o.kind]), p.v0));   // under an awning, on a loading dock: nothing is stood there
    const gaps = mine.slice(1).map((p, k) => [mine[k].u1 + mine[k].wing, p.u0]);
    if (mine.length) gaps.push([mine.at(-1).u1 + mine.at(-1).wing, side.to - 0.6]);
    let holds = side.id === 'e' ? 2 : 0, pockets = south ? 1 : 0, shelters = 0;   // what a loading bay holds, in turn; the small gaps and the bus stops so far
    for (const [g0, g1] of gaps) {
      // the widest stretch of the gap that no crossing leads into
      const [a, c] = runs(g0, g1, crossings.map(u => [u - 1.15, u + 1.15]), 99).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0] || [0, 0];
      const wide = c - a, mid = (a + c) / 2, city = cityAt(mid);
      if (wide >= 3.2 && !city) {   // parking bays, nose to the kerb
        const n = Math.min(4, Math.floor((wide - 0.7) / 1.22)), from = mid - n * 0.61;
        mark(side, mid, 1.15, n * 1.22 + 0.3, 2.3, PAINT.bay, 0);
        for (let k = 0; k <= n; k++) mark(side, from + k * 1.22, 1.2, 0.07, 2.1, PAINT.white);
        cuts.outer.push([from - 0.15, from + n * 1.22 + 0.15]);
        for (let k = 0; k < n; k++) if (rnd() < 0.72) place(side, 'car', from + (k + 0.5) * 1.22, 1.2, { flip: rnd() < 0.3, tint: Math.floor(rnd() * 7), free: true });
        taken.push(side.rect(from - 0.15, from + n * 1.22 + 0.15, 0, 2.3));
      } else if (wide >= 3.2) {   // a loading bay: a hatched box, and a lorry, containers or tanks on it
        hatch(side, a + 0.4, c - 0.4, 0.1, 3.1);
        cuts.outer.push([a + 0.4, c - 0.4]);
        const what = ['truck', 'containers', 'tanks'][holds++ % 3];
        if (what === 'truck') place(side, 'truck', mid, 1.75, { tint: Math.floor(rnd() * 4), flip: rnd() < 0.5 });
        else if (!place(side, what, mid, what === 'tanks' ? 1.45 : 1.5, { tint: Math.floor(rnd() * 5) })) place(side, 'containers', mid, 1.6, { quarter: true, tint: Math.floor(rnd() * 5) });
        taken.push(side.rect(a + 0.4, c - 0.4, 0, 3.1));
      } else if (wide >= 1.9) {
        if (city) { place(side, 'drums', mid - 0.45, 1.2, { tint: Math.floor(rnd() * 3) }); place(side, 'hydrant', mid + 0.6, 0.45); }
        else if (pockets++ % 2 && place(side, 'kiosk', mid, 0.95, { tint: pockets })) continue;   // every second pocket: a news stand
        else { place(side, 'tree', mid, 0.9, { tint: Math.floor(rnd() * 3) }); place(side, 'bench', mid, 2.1); }
      } else if (wide >= 0.9) place(side, city ? 'drums' : 'bin', mid, 0.95, { tint: Math.floor(rnd() * 3) });
      if (!cityAt((g0 + g1) / 2) && g1 - g0 >= 1.7) place(side, 'tree', (g0 + g1) / 2, 7.7, { tint: Math.floor(rnd() * 3) });   // green behind the row, where the block ends
    }

    // --- in front of each building, by what it is
    for (const p of mine) {
      const kind = p.o.kind, mid = (p.u0 + p.u1) / 2, tint = p.o.tint, front = p.v0 - FRONT[kind];   // front: where its awning, canopy or dock ends
      if (mid < side.from + 1 || mid > side.to - 1 || zebra(mid)) continue;
      if (kind === 'shop') {
        if (front >= 1.8) for (const s of [-1, 1]) place(side, 'cafe', mid + s * 0.95, front - 0.85, { tint });   // tables on the pavement
        else place(side, 'planter', mid, front - 0.45, { tint });
      } else if (kind === 'office') {
        for (const s of [-1, 1]) place(side, 'planter', mid + s * (p.u1 - p.u0) * 0.28, front - 0.45, { tint });
      } else if (kind === 'flats') {
        // a bus shelter where the pavement is deep enough, with its box painted on the road; a bench and a letter box elsewhere
        const at = south && shelters < 2 ? [0, -1, 1].map(off => mid + off).find(u => place(side, 'shelter', u, 0.85, { tint })) : undefined;
        if (at !== undefined) { frame(side, at - 1.6, at + 1.6, -0.98, -0.12, PAINT.yellow); shelters++; }
        else { place(side, 'bench', mid - 0.9, front - 0.45); place(side, 'mailbox', mid + 0.9, front - 0.4, { tint }); }
      } else if (kind === 'hotel') {
        if (front - K > 0.4) mark(side, mid, (front + K) / 2, 1.2, front - K, PAINT.carpet, 0);   // a carpet from the kerb to its canopy
        for (const s of [-1, 1]) place(side, 'planter', mid + s * 1.6, front - 0.45, { tint });
      } else if (kind === 'garage') {   // the way in, across the pavement
        if (!hit(side.rect(mid - 0.9, mid + 0.9, 0.2, p.v0 - 0.2))) { mark(side, mid, p.v0 / 2, 1.8, p.v0, PAINT.bay, 0); cuts.outer.push([mid - 0.9, mid + 0.9]); taken.push(side.rect(mid - 0.9, mid + 0.9, 0, p.v0)); }
      } else if (kind === 'factory') {   // a hatched box before its doors
        if (!hit(side.rect(mid - 1, mid + 1, 0.2, p.v0 - 0.3))) { hatch(side, mid - 1, mid + 1, 0.1, p.v0 - 0.1); cuts.outer.push([mid - 1, mid + 1]); taken.push(side.rect(mid - 1, mid + 1, 0, p.v0)); }
        place(side, 'drums', p.u0 + 0.65, front - 0.7, { tint: Math.floor(rnd() * 3) });
      } else if (kind === 'warehouse') {
        if (!place(side, 'truck', mid, front - 1.75, { tint: Math.floor(rnd() * 4) })) place(side, 'drums', mid - 1.1, front - 0.7, { tint: Math.floor(rnd() * 3) });
      } else if (kind === 'plant') {
        for (let u = p.u0 + 0.5; u < p.u1 - 0.3; u += 1.1) place(side, 'bollard', u, front - 0.3, { tint: 1 });
      }
    }

    // --- along the kerb: lamps, and between them trees (the Metropolis) or a hydrant (the city)
    let lamps = 0, trees = 0;
    for (let u = side.from + 2.4 + rnd() * 1.2; u < side.to - 1.2; u += 8.6) {
      const city = cityAt(u);
      for (const off of [0, 0.9, -0.9, 1.8, -1.8, 2.7, -2.7]) if (place(side, city ? 'flood' : 'lamp', u + off, 0.42)) { if (!city && lamps++ % 2 === 0) place(side, 'bin', u + off + 0.6, 0.42); break; }
      const mid = u + 4.3;
      if (mid > side.to - 1.5) break;
      if (cityAt(mid)) place(side, 'hydrant', mid, 0.4);
      else for (const off of [0, 1, -1, 2, -2, 3, -3]) if (place(side, 'tree', mid + off, 0.75, { tint: Math.floor(rnd() * 3) })) { if (trees++ % 2 === 0) [1.35, -1.35].some(by => place(side, 'bench', mid + off + by, 0.62)); break; }   // and a bench beside every second one
    }

    // --- paint on the carriageway
    const dashFrom = south ? x1 + 1 : side.from + 1.6, dashTo = south ? side.to - 3 : (side.id === 'w' || joined ? z0 - 0.6 : side.to - 1.4);
    for (let u = dashFrom; u + 1 < dashTo; u += 2) if (!zebra(u + 0.5)) mark(side, u + 0.5, -RW / 2, 1, 0.09, PAINT.white);
    for (const [a, c] of runs(dashFrom - 0.8, dashTo, crossings.map(u => [u - 1, u + 1]), 6.5)) if (cityAt((a + c) / 2)) for (const v of [-0.16, -RW + 0.16]) mark(side, (a + c) / 2, v, c - a, 0.07, PAINT.yellow);   // the city's roads are lined in yellow
    for (let u = dashFrom + 5 + rnd() * 4, k = 0; u < dashTo - 2; u += 13 + rnd() * 7, k++) {
      const [x, z] = side.at(u, k % 2 ? -0.72 : -RW + 0.72);
      if (!zebra(u) && kept([x - 0.4, x + 0.4, z - 0.4, z + 0.4])) covers.push([x, z, 0.3]);
    }
    for (let u = dashFrom + 2 + rnd() * 3; u < dashTo; u += 9 + rnd() * 3) if (!zebra(u)) mark(side, u, -0.13, 0.5, 0.16, PAINT.drain);

    // --- kerbs: along the pavement, along the verge by the fence, and across the ends
    for (const [a, c] of runs(side.from - K, side.to, cuts.outer)) kerbs.push(side.rect(a, c, 0, K));
    for (const [a, c] of runs(south ? x1 : side.from - K, south ? (joined && hasEast ? e0 : east) : z0, cuts.inner)) kerbs.push(side.rect(a, c, -RW - K, -RW));
    if (south && joined && hasEast) for (const [a, c] of runs(e1, east, cuts.inner)) kerbs.push(side.rect(a, c, -RW - K, -RW));
    if (!south) {   // the end of a side street: a kerb and a barrier across it
      kerbs.push(side.rect(side.from - K, side.from, -RW - K, K));
      place(side, 'barrier', side.from + 0.55, -RW / 2, { free: true, quarter: true });
      if (side.id === 'e' && !joined) { kerbs.push(side.rect(side.to, side.to + K, -RW - K, K)); place(side, 'barrier', side.to - 0.55, -RW / 2, { free: true, quarter: true }); }
    } else {   // the south street ends by the building site's gate: a hatched box, cones, and a kerb to close it
      kerbs.push(side.rect(side.to - K, side.to, -RW - K, K));
      hatch(side, side.to - 2.5, side.to - 0.45, -RW + 0.2, -0.2);
      for (const v of [-RW + 0.45, -RW / 2, -0.45]) place(side, 'cone', side.to - 0.75, v, { free: true });
    }
  }

  // --- around the outside of it all, where the paving ends: a clipped hedge around the Metropolis, a works wall beside the city
  const rims = [], RIM = 0.4, IN = 0.08, outer = b.maxZ + W - IN;
  const rim = (xa, xb, za, zb) => {
    const alongX = xb - xa > zb - za, strip = [xa, xb, za, zb];
    const stops = taken.filter(t => touch(strip, t, 0.15)).map(t => (alongX ? [t[0] - 0.25, t[1] + 0.25] : [t[2] - 0.25, t[3] + 0.25]));   // it parts for a building, a road, a tree
    for (const [p, q] of runs(alongX ? xa : za, alongX ? xb : zb, stops)) {
      const piece = alongX ? [p, q, za, zb] : [xa, xb, p, q];
      if (q - p >= 1 && kept(piece)) rims.push([...piece, whereAt((piece[0] + piece[1]) / 2, (piece[2] + piece[3]) / 2)]);
    }
  };
  rim(b.minX - W + IN, east - IN, outer - RIM, outer);                    // south
  rim(b.minX - W + IN, b.minX - W + IN + RIM, zN, outer - RIM);           // west
  rim(east - IN - RIM, east - IN, zN, outer - RIM);                       // east

  // --- the pavements: every part of a slab that is not carriageway, cut where the yards and the roads end
  const cutsX = [...new Set([...slabs.flatMap(s => [s[0], s[1]]), ...roads.flatMap(r => [r[0], r[1]])])].sort((p, q) => p - q);
  const cutsZ = [...new Set([...slabs.flatMap(s => [s[2], s[3]]), ...roads.flatMap(r => [r[2], r[3]]), ...rects.flatMap(r => [r.minZ, r.maxZ])])].sort((p, q) => p - q);
  const inside = (x, z, list) => list.some(q => x > q[0] && x < q[1] && z > q[2] && z < q[3]);
  const paving = [];
  for (let k = 0; k < cutsZ.length - 1; k++) {
    let open = null;
    for (let i = 0; i < cutsX.length - 1; i++) {
      const x = (cutsX[i] + cutsX[i + 1]) / 2, z = (cutsZ[k] + cutsZ[k + 1]) / 2;
      const where = inside(x, z, slabs) && !inside(x, z, roads) ? whereAt(x, z) : null;
      if (open && open[4] === where) open[1] = cutsX[i + 1];
      else { open = where ? [cutsX[i], cutsX[i + 1], cutsZ[k], cutsZ[k + 1], where] : null; if (open) paving.push(open); }
    }
  }
  return { roads, paving, kerbs, marks, covers, props, rims };
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
