// The Workers' Park as plain numbers: what each stage adds to its plot, the lane to it, who comes to an activity and
// where, the footprints nobody walks through, and how long the picture of an activity lasts. js/park.js draws it;
// tests/park-model.test.mjs checks it without a screen.
import { BUILDS, SITE } from '../data/builds.js';
import { LEAVES, NEON, PEOPLE } from '../data/looks.js';
import { mulberry, stagesShown, isPark, block, round, COLORS, PAD } from './plotkit.js';

// The fourth build is not a building. It has a plot of its own (SITE.park) south of the site's, and is drawn from the
// layers its stages name (js/data/builds.js, `adds`): a lawn with paths, a fence and a gate; a stage and benches; food
// stalls and a barbecue corner; light masts, strings of lamps, a car park and flower beds. Everything is in world
// coordinates. The camera looks north, so the stage's open front, the stalls' counters and every detail face south.
//
// Everything a figure uses or stands beside is as large as the figures (2 m tall, a counter 1.2 high): the stage, the
// stalls, the benches, the tables, and the cars they came in (2.85 m long, 1.3 high), which a crowd walks past. Only
// the trees are small ones.
//
// Parts: `block` (edge: its edges are rounded by this much), `round`, `flat` (lies on the ground: paving, paint), `ball`
// (a crown, a flower, a lamp of a string; sy flattens it), `star`, and for the night and the activities `pool` (a pool
// of light on the ground, or a halo when it lies at a lamp's height; d: its depth when it is not square), `beam` (a
// spotlight's beam from `at` down to `to`), `figure` and `shade` (the dark patch under a figure). cast: it throws a shadow
// (only the large shapes do). ground: it is the ground itself (lawn, paving, asphalt), which the rain soaks and the snow
// whitens with the rest of the world. night: it shines after dark. show: it is there only while an activity runs.

const flat = (w, d, color, x, y, z, more = {}) => ({ kind: 'flat', w, d, color, at: [x, y, z], ...(y < 0.2 ? GROUND : null), ...more });
const ball = (r, color, x, y, z, more = {}) => ({ kind: 'ball', r, color, at: [x, y, z], ...more });
const star = (r, depth, color, x, y, z, more = {}) => ({ kind: 'star', r, depth, color, at: [x, y, z], ...more });
const pool = (size, color, x, y, z, more = {}) => ({ kind: 'pool', size, color, at: [x, y, z], night: true, ...more });
const BIG = { cast: true }, GROUND = { ground: true };
export const PARK_GROUND = 0.08;   // how high the park's lawn and paths lie: the player is lifted onto them (groundAt)

const PC = {
  kerb: 0xcfcabd, earth: [0xb9aa8c, 0xb09f80], lawn: [0x5cab48, 0x69b853], paving: [0xe6d9bb, 0xd9caa6], ring: 0xc4b188, medal: 0xf1e7cd, inlay: 0xd9a441, slab: 0xc9c6bd,
  white: 0xf2f1ec, cream: 0xf0e2c4, red: 0xd4483b, darkRed: 0xb23a30, amber: 0xf2a900, blue: 0x3d7be2, pink: 0xd94f8a, teal: 0x2f8f83, gold: 0xf2c230,
  curtain: 0x4a3f8c, wing: 0x3d3474, deck: 0xb9814a, plank: 0x93633a, wood: 0xa8743f, iron: 0x3c434c, black: 0x23262b, cone: 0x8a9099, grate: 0x55595f,
  soil: 0x4a3a2c, trunk: 0x6b4226, leaves: LEAVES, asphalt: 0x5c626b, line: 0xf2f2f2, tyre: 0x1d1f23, pane: 0x2b3a4a, wire: 0x596068,
  stalls: [0xd4483b, 0xf2a900, 0x3d7be2], cars: [0xe23d3d, 0xf0f0f0, 0x3d7be2, 0xf2c230], beds: [0xd4483b, 0xf2c230, 0xd94f8a, 0xf2f1ec, 0xe8742c],
  // the dark patch under a figure; light: a lamp's glass, the pool under it on the lawn (warm), on the stage's boards, and
  // on pale paving, which a full one would bleach to a white square (soft: weak and amber, so the slabs show through
  // it), the halo round a lamp, the coals of the grill; and a mast's pale post
  shade: 0x1c2410, lamp: 0xfff1c2, warm: 0xffc070, boards: 0xffd9a0, soft: 0x70480f, halo: 0xb89a5c, ember: 0xff7a3a, post: 0xe9e4d6,
  // the lamps of the strings, the spotlights' gels and beams, and their coloured light on the pale plaza
  bulbs: [0xff5a4a, 0xffd84a, 0x6dff9a, 0x4fc3ff, 0xff7ac8], beams: NEON, floor: [0xd81f7a, 0x1496d8, 0xd89a00],
};

/** Where everything of the park stands. The drawing, the footprints nobody walks through and the crowd all read it. */
export const PARK = (() => {
  const p = SITE.park, mid = (SITE.plot.minX + SITE.plot.maxX) / 2, K = 0.35;
  return {
    K,                                                       // the kerb's width; the fence stands on it
    gate: [mid - 2, mid + 2],                                // the opening in the north fence, opposite the one in the site's south fence
    in: { x0: p.minX + K, x1: p.maxX - K, z0: p.minZ + K, z1: p.maxZ - K },
    stage: { x0: 107, x1: 115.2, z0: 128.5, z1: 133, deck: 1, top: 5 },
    stalls: [94.4, 97.4, 100.4].map(x => ({ x, z: 129.6, w: 2.6, d: 2 })),
    court: { x0: p.minX + 0.85, x1: mid - 1.4, z0: 128.2, z1: 133.6 },   // the paving the stalls stand on
    plaza: { x0: mid - 1.4, x1: 115.4, z0: 133.6, z1: 141.2 },
    medal: [109.2, 137.3],
    benches: [105.4, 108.1, 110.8, 113.5].map(x => [x, 140.5]),
    grill: [95.2, 136.2], tables: [[98.9, 136.7], [96.3, 139.9]],
    parking: { x0: 93, x1: 101.4, z0: 143.6, z1: 148.3 },
    masts: [[p.minX + 0.95, p.minZ + 0.95], [p.maxX - 0.95, p.minZ + 0.95], [p.minX + 0.95, p.maxZ - 0.95], [p.maxX - 0.95, p.maxZ - 0.95]],
    beds: [106.4, 108.3, 110.2, 112.1, 114].map(x => [x, 147.75]),
    trees: [[101.3, 138.2], [100.6, 142.6], [96.6, 142.4], [107, 144.3], [111.4, 144.7]],
    works: { pallet: [108.2, 143.6], heap: [110.6, 144] },
  };
})();

/**
 * The layers of the park that are to be seen: every layer of a finished stage, and of the stage in work the first
 * ones, one more for each equal share of its goods that has arrived (the last comes with the finished stage).
 * @param part  how far the stage in work has got (stagePart)
 * @returns {string[]}  names from the stages' `adds`
 */
export function parkShown(site, part = 0) {
  const b = BUILDS.find(isPark), shown = b ? stagesShown(site, b) : -1;
  if (shown < 0) return [];
  const names = b.stages.slice(0, shown).flatMap(st => st.adds), now = b.stages[shown];
  return now ? [...names, ...now.adds.slice(0, Math.floor(part * now.adds.length + 1e-9))] : names;
}

/**
 * The park's plot from the moment the park is begun: levelled ground inside a stone kerb, which stays under the lawn,
 * and while it is built the works: pegs at the corners, a pallet of bricks and a heap of sand.
 */
export function parkPlot({ works = true } = {}) {
  const p = SITE.park, { K, gate } = PARK, cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2, w = p.maxX - p.minX, d = p.maxZ - p.minZ, parts = [];
  // levelled earth in beds of two tones, not one bare sheet
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) parts.push(flat((w - K) / 4, (d - K) / 4, PC.earth[(i + k) % 2], p.minX + K / 2 + (w - K) / 4 * (i + 0.5), 0.03, p.minZ + K / 2 + (d - K) / 4 * (k + 0.5)));
  const kerb = (x0, x1, z0, z1) => parts.push(block(x1 - x0, 0.14, z1 - z0, PC.kerb, (x0 + x1) / 2, 0.07, (z0 + z1) / 2));
  kerb(p.minX, gate[0], p.minZ, p.minZ + K); kerb(gate[1], p.maxX, p.minZ, p.minZ + K);   // the north side, open at the gate
  kerb(p.minX, p.maxX, p.maxZ - K, p.maxZ); kerb(p.minX, p.minX + K, p.minZ + K, p.maxZ - K); kerb(p.maxX - K, p.maxX, p.minZ + K, p.maxZ - K);
  if (works) {
    for (const [x, z] of [[p.minX + 0.8, p.minZ + 0.8], [p.maxX - 0.8, p.minZ + 0.8], [p.minX + 0.8, p.maxZ - 0.8], [p.maxX - 0.8, p.maxZ - 0.8]]) parts.push(block(0.12, 0.7, 0.12, COLORS.peg, x, 0.35, z));
    const [px, pz] = PARK.works.pallet, [hx, hz] = PARK.works.heap;
    parts.push(block(1.2, 0.14, 1.2, COLORS.wood, px, 0.12, pz), block(1, 0.55, 1, COLORS.brick, px, 0.46, pz, { edge: 0.05, ...BIG }), round(0.25, 1.2, 0.8, 0xd9c08a, hx, 0.45, hz, BIG));
    // what will stand where, marked out in lime on the earth: the stage, the plaza, the stalls' court and the car park
    const S = PARK.stage, line = (x0, x1, z0, z1) => parts.push(flat(Math.max(0.1, x1 - x0), Math.max(0.1, z1 - z0), PC.line, (x0 + x1) / 2, 0.036, (z0 + z1) / 2));
    for (const r of [{ x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1 }, PARK.plaza, PARK.court, PARK.parking]) { line(r.x0, r.x1, r.z0, r.z0); line(r.x0, r.x1, r.z1, r.z1); line(r.x0, r.x0, r.z0, r.z1); line(r.x1, r.x1, r.z0, r.z1); }
  }
  return parts;
}

/** The path between the two openings, from the site's south fence to the park's gate: drawn with the park, on ground that is neither plot's. */
export function parkLane() {
  const [x0, x1] = PARK.gate, z0 = SITE.plot.maxZ, z1 = SITE.park.minZ, parts = [], n = 2, d = (z1 - z0) / n;
  for (let i = 0; i < n; i++) parts.push(flat(x1 - x0 - 0.5, d, PC.paving[i % 2], (x0 + x1) / 2, 0.035, z0 + d * (i + 0.5)));
  for (const x of [x0 + 0.12, x1 - 0.12]) parts.push(block(0.24, 0.1, z1 - z0, PC.kerb, x, 0.05, (z0 + z1) / 2));
  return parts;
}

/** Where the signpost that names the park stands: outside its fence, west of the gate. [x, z] */
export const parkSignpost = () => [PARK.gate[0] - 1.5, SITE.park.minZ - 0.9];

/** A rectangle of paving as tiles of two tones, about 1.9 m each: joints that are seen from the camera's height. */
function paved(x0, x1, z0, z1, y, out, flip = 0) {
  const nx = Math.max(1, Math.round((x1 - x0) / 1.9)), nz = Math.max(1, Math.round((z1 - z0) / 1.9)), w = (x1 - x0) / nx, d = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) out.push(flat(w, d, PC.paving[(i + k + flip) % 2], x0 + w * (i + 0.5), y, z0 + d * (k + 0.5)));
}

/** A string of lamps from a to b ([x, y, z] each), sagging in the middle: a lamp about every 0.9 m, the wire in straight pieces. */
function lampString(a, b, out, first = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(3, Math.round(len / 0.9)), sag = Math.min(1, len * 0.05);
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const m = Math.ceil(n / 3);
  for (let j = 0; j < m; j++) {
    const p = at(j / m), q = at((j + 1) / m), dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], run = Math.hypot(dx, dz);
    out.push(block(Math.hypot(run, dy), 0.022, 0.022, PC.wire, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, { turn: [0, Math.atan2(-dz, dx), Math.atan2(dy, run)] }));
  }
  for (let i = 0; i < n; i++) {   // each lamp with a small halo in its own colour: after dark it is a light, not a bead
    const [x, y, z] = at((i + 0.5) / n), c = PC.bulbs[(i + first) % PC.bulbs.length];
    out.push(ball(0.2, c, x, y - 0.12, z, { night: true }), pool(1.15, c, x, y - 0.1, z));
  }
}

/** What the crowd wears: what the shops' customers wear, and a few colours more for a day out. */
const DARK = PEOPLE.hair.slice(0, 4);   // the customers' hair without the palest: on a head here, white is the cook's hat
const FIGURE = { shirt: [...PEOPLE.shirt, 0xf2f1ec, 0x5aa845], pants: [...PEOPLE.pants, 0x6b7078], skin: PEOPLE.skin, hair: [...DARK, ...DARK, 0x8f8a82, ...DARK, 0x8a4b2a, 0x8a4b2a] };   // one head in fifteen is grey
/** How many come to each part of an activity: the band, the audience on the plaza, the benches, the stalls, the grill and the tables. */
const CROWDS = {
  barbecue: { band: 0, plaza: 0, benches: 3, stalls: 0, tables: 8, lawn: 11 },
  concert: { band: 4, plaza: 40, benches: 4, stalls: 0, tables: 0, lawn: 0 },
  festival: { band: 4, plaza: 30, benches: 3, stalls: 6, tables: 6, lawn: 4 },
};

/**
 * Who is in the park during an activity: figures as parts, each with where it stands, which way it faces (turn: 0 is
 * toward the camera) and what it does: 'play' on the stage, 'cheer' or 'stand' before it, 'sit' on a bench, 'serve'
 * behind a counter, 'cook' at the grill. The same crowd every time. key: it stays when only part of the crowd is drawn.
 */
function parkCrowd(has, activity, share) {
  const n = CROWDS[activity] || CROWDS.festival, rnd = mulberry(activity === 'barbecue' ? 811 : activity === 'concert' ? 812 : 813), out = [];
  const pick = list => list[Math.floor(rnd() * list.length)];
  const figure = (x, y, z, turn, pose, more = {}) => out.push({ kind: 'figure', at: [+x.toFixed(2), y, +z.toFixed(2)], turn: +turn.toFixed(2), pose, show: true,
    shirt: pick(FIGURE.shirt), pants: pick(FIGURE.pants), skin: pick(FIGURE.skin), hair: pick(FIGURE.hair), size: +(0.9 + rnd() * 0.12).toFixed(2), phase: +(rnd() * 6.28).toFixed(2), ...more });
  const S = PARK.stage, cx = (S.x0 + S.x1) / 2;
  if (has('stage') && n.band) {   // the band stands at the front of the stage, where the canopy does not hide it
    figure(cx - 0.3, S.deck, S.z1 - 0.75, 0, 'play', { key: true, shirt: 0xf2f1ec });
    figure(cx - 2.7, S.deck, S.z1 - 1, 0.25, 'play', { key: true, shirt: 0xd4483b });
    figure(cx + 2.4, S.deck, S.z1 - 1, -0.25, 'play', { key: true, shirt: 0x23262b });
    figure(cx + 0.95, S.deck, S.z1 - 2.3, 0, 'play', { key: true, shirt: 0xf2a900 });
  }
  if (has('lawn') && n.plaza) {   // the audience: rows before the stage, closer together at the front
    const A = PARK.plaza, x0 = A.x0 + 0.9, x1 = A.x1 - 0.7, z0 = S.z1 + 1.9, z1 = A.z1 - 1.9, rows = 5, per = Math.ceil(n.plaza / rows);
    for (let i = 0; i < n.plaza; i++) {
      const row = Math.floor(i / per), col = i % per, x = x0 + (x1 - x0) * (col + 0.5 + (row % 2 ? 0.25 : -0.25) * 0.8) / per, z = z0 + (z1 - z0) * row / (rows - 1);
      figure(x + (rnd() - 0.5) * 0.45, 0, z + (rnd() - 0.5) * 0.4, Math.PI + (rnd() - 0.5) * 0.5, rnd() < 0.72 ? 'cheer' : 'stand');
    }
  }
  if (has('benches')) for (let i = 0; i < n.benches; i++) { const [x, z] = PARK.benches[i % PARK.benches.length]; figure(x + (i % 2 ? 0.45 : -0.4), 0, z - 0.08, Math.PI, 'sit'); }
  if (has('stalls') && n.stalls) {
    PARK.stalls.forEach((st, i) => {   // somebody behind every counter, and customers before it
      figure(st.x + 0.2, 0, st.z - 0.1, 0, 'serve', { key: true, shirt: PC.stalls[i] });
      for (let k = 0; k < n.stalls / 3; k++) figure(st.x - 0.6 + k * 1.15 + (rnd() - 0.5) * 0.3, 0, st.z + st.d / 2 + 0.75 + k * 0.5 + rnd() * 0.3, Math.PI + (rnd() - 0.5) * 0.4, 'stand');
    });
  }
  if (has('barbecue') && n.tables) {
    const [gx, gz] = PARK.grill;
    figure(gx + 0.3, 0, gz - 0.95, 0, 'cook', { key: true, shirt: 0xf2f1ec, hair: DARK[2], size: 1 });   // the cook behind the grill: the tall white hat is a part of its own (parkParts)
    for (let i = 0; i < n.tables; i++) {   // at the tables: two on each bench, facing each other
      const [tx, tz] = PARK.tables[i % 2], k = Math.floor(i / 2), north = k % 2 === 0;
      figure(tx + (k < 2 ? -0.5 : 0.5), 0, tz + (north ? -0.72 : 0.72), north ? 0 : Math.PI, 'sit');
    }
    const mid = PARK.stalls[1], front = mid.z + mid.d / 2;
    const spots = [[gx - 0.6, gz + 1.25, 3.1], [gx + 0.7, gz + 1.5, 3.3], [gx + 1.9, gz + 1.1, 2.6], [gx - 1.3, gz + 2.6, 0.9], [mid.x - 0.5, front + 0.85, 3.3], [mid.x + 0.65, front + 1.2, 2.9],
      [99.6, 134.6, 1.2], [100.7, 134.9, 4.4], [94.1, 141.6, 0.4], [95.2, 141.9, 3.6], [gx - 0.3, gz + 2.9, 3.9]];
    for (let i = 0; i < Math.min(n.lawn, spots.length); i++) figure(spots[i][0], 0, spots[i][1], spots[i][2], 'stand');   // waiting at the grill, at the middle stall, and talking on the lawn
  }
  if (share >= 1) return out;
  let k = 0;   // part of the crowd: every figure that matters, and an even share of the rest
  return out.filter(f => f.key || Math.floor((k + 1) * share) > Math.floor(k++ * share));
}

/**
 * The park as parts, for the layers that are to be seen (parkShown): what every stage adds, with the lamps that shine
 * after dark and their pools of light. During an activity (`lit`) those lamps are lit whatever the hour (glow), the
 * stage's spotlights throw beams and coloured pools, and with `crowd` above 0 the people of that activity are there,
 * each with a dark patch on the ground under it (`shade`).
 * @param shown     names of layers (the stages' `adds`): what is not named is not drawn
 * @param o         lit: an activity runs; crowd: the share of its people to draw, 0 to 1; activity: which one
 * @returns parts   see the top of this section; `name` marks the few the footprints and the tests look for
 */
export function parkParts(shown, { lit = false, crowd = 0, activity = 'festival' } = {}) {
  const p = SITE.park, I = PARK.in, { K, gate } = PARK, parts = [], add = (...a) => parts.push(...a), has = name => shown.includes(name);
  const cz = (p.minZ + p.maxZ) / 2, mid = (gate[0] + gate[1]) / 2;

  if (has('lawn')) {   // mown in stripes, with the paths and the plaza laid on it
    for (let i = 0, x = I.x0; x < I.x1 - 0.01; i++, x += 2) { const w = Math.min(2, I.x1 - x); add(flat(w, I.z1 - I.z0, PC.lawn[i % 2], x + w / 2, 0.05, cz)); }
    const C = PARK.court, A = PARK.plaza, [mx, mz] = PARK.medal;
    paved(gate[0] + 0.6, gate[1] - 0.6, p.minZ, C.z1, 0.07, parts);                 // in from the gate
    paved(C.x0, C.x1, C.z0, C.z1, 0.07, parts, 1); paved(A.x0, A.x1, A.z0, A.z1, 0.07, parts);
    paved(A.x0, A.x0 + 1.8, A.z1, 146.5, 0.07, parts, 1); paved(PARK.parking.x1, A.x0, 145, 146.5, 0.07, parts);   // and on to the car park
    add(round(2.5, 2.5, 0.02, PC.ring, mx, 0.085, mz, { seg: 24, ...GROUND }), round(2.2, 2.2, 0.02, PC.medal, mx, 0.095, mz, { seg: 24, name: 'medal', ...GROUND }),
      star(1.55, 0.02, PC.inlay, mx, 0.11, mz, { turn: [-Math.PI / 2, 0, 0], ...GROUND }));   // a star set in the plaza, as on the stage
  }

  if (has('fence')) {   // low and white, on the kerb; open at the gate
    const f = 0.18, y = 0.14, post = (x, z) => add(block(0.14, 0.95, 0.14, PC.white, x, y + 0.475, z));
    const rail = (x0, z0, x1, z1) => { const along = x0 !== x1, len = Math.hypot(x1 - x0, z1 - z0); for (const h of [0.45, 0.82]) add(block(along ? len : 0.07, 0.09, along ? 0.07 : len, PC.white, (x0 + x1) / 2, y + h, (z0 + z1) / 2)); };
    const xs = [], zs = [], nx = 12, nz = 11;
    for (let i = 0; i <= nx; i++) xs.push(p.minX + f + (p.maxX - p.minX - 2 * f) * i / nx);
    for (let i = 1; i < nz; i++) zs.push(p.minZ + f + (p.maxZ - p.minZ - 2 * f) * i / nz);
    for (const x of xs) { if (x < gate[0] - 0.01 || x > gate[1] + 0.01) post(x, p.minZ + f); post(x, p.maxZ - f); }
    for (const z of zs) { post(p.minX + f, z); post(p.maxX - f, z); }
    post(gate[0], p.minZ + f); post(gate[1], p.minZ + f);
    rail(p.minX + f, p.minZ + f, gate[0], p.minZ + f); rail(gate[1], p.minZ + f, p.maxX - f, p.minZ + f);
    rail(p.minX + f, p.maxZ - f, p.maxX - f, p.maxZ - f); rail(p.minX + f, p.minZ + f, p.minX + f, p.maxZ - f); rail(p.maxX - f, p.minZ + f, p.maxX - f, p.maxZ - f);
  }

  if (has('gate')) {   // an arch over the way in: two posts, a beam with a board and a star, pennants under it and a lantern on each post
    const z = p.minZ + 0.18;
    for (const x of gate) add(block(0.36, 3.2, 0.36, PC.white, x, 1.6, z, { edge: 0.06, ...BIG }), block(0.22, 0.3, 0.2, PC.lamp, x, 2.3, z + 0.27, { night: true }));
    add(block(gate[1] - gate[0] + 0.9, 0.55, 0.32, PC.red, mid, 3.42, z, { edge: 0.08, ...BIG }), block(3, 0.3, 0.05, PC.cream, mid, 3.42, z + 0.18),
      star(0.45, 0.12, PC.gold, mid, 4.05, z, { turn: [-0.2, 0, 0], night: true }));
    for (let i = 0; i < 7; i++) add(block(0.3, 0.3, 0.03, PC.bulbs[i % 5], gate[0] + 0.5 + i * 0.5, 2.98 - 0.12 * Math.sin(Math.PI * i / 6), z + 0.05, { turn: [0, 0, Math.PI / 4] }));
    add(pool(5, PC.soft, mid, 0.13, z + 1.7, { d: 3.6 }), pool(1.5, PC.halo, mid, 4.2, z + 0.2));
  }

  if (has('stage')) {
    const { x0, x1, z0, z1, deck, top } = PARK.stage, cx = (x0 + x1) / 2, w = x1 - x0, zt = z1 - 0.25, wallTop = deck + 3.2;
    add(block(w + 1.2, 0.1, z1 - z0 + 1.1, PC.slab, cx, 0.1, (z0 + z1) / 2 + 0.15),
      block(w, deck - 0.15, z1 - z0 - 0.1, PC.deck, cx, 0.15 + (deck - 0.15) / 2, (z0 + z1) / 2 + 0.05, { edge: 0.08, name: 'deck', ...BIG }),
      block(w - 0.3, 0.42, 0.05, PC.red, cx, 0.6, z1 + 0.02), block(w - 0.3, 0.07, 0.06, PC.cream, cx, 0.85, z1 + 0.025));
    for (let i = 1; i <= 3; i++) add(flat(w - 0.3, 0.06, PC.plank, cx, deck + 0.006, z1 - 1.1 * i));
    // the back wall with its two wings, the canopy over the back half, and over it the crest with the star: from the
    // camera's height a roof hides the wall under it, so what the stage is known by stands above the roof
    add(block(w, 3.2, 0.3, PC.curtain, cx, deck + 1.6, z0 + 0.15, BIG));
    for (const x of [x0 + 0.15, x1 - 0.15]) add(block(0.3, 3.2, 2.3, PC.wing, x, deck + 1.6, z0 + 1.15, BIG));
    const tilt = -0.07, cy = wallTop + 0.1, cz0 = z0 + 1.25, rise = z => cy - (z - cz0) * Math.sin(tilt);   // the canopy rises a little to the front
    add(block(w + 0.7, 0.2, 2.7, PC.red, cx, cy, cz0, { turn: [tilt, 0, 0], edge: 0.06, name: 'canopy', ...BIG }),
      block(w + 0.74, 0.34, 0.1, PC.gold, cx, rise(cz0 + 1.36) - 0.02, cz0 + 1.36, { turn: [tilt, 0, 0] }),
      block(w + 0.7, 0.03, 0.3, PC.cream, cx, rise(cz0 + 0.85) + 0.105, cz0 + 0.85, { turn: [tilt, 0, 0] }),
      block(w - 0.4, 0.07, 0.07, PC.lamp, cx, rise(cz0 + 1.3) - 0.22, cz0 + 1.3, { night: true }));
    for (const dx of [-w / 4, 0, w / 4]) add(block(0.1, 0.05, 2.6, PC.darkRed, cx + dx, cy + 0.11, cz0, { turn: [tilt, 0, 0] }));
    add(block(3.6, 1.15, 0.3, PC.curtain, cx, wallTop + 0.55, z0 + 0.15, { edge: 0.12, ...BIG }), block(3.8, 0.12, 0.36, PC.gold, cx, wallTop + 1.16, z0 + 0.15),
      star(0.62, 0.12, PC.gold, cx, wallTop + 0.6, z0 + 0.36, { turn: [-0.25, 0, 0], night: true }));
    // the truss across the front on its two towers, with five spotlights under it
    for (const x of [x0 + 0.25, x1 - 0.25]) add(block(0.3, top - deck, 0.3, PC.iron, x, (top + deck) / 2, zt, BIG));
    for (const y of [top - 0.45, top]) add(block(w - 0.2, 0.09, 0.09, PC.iron, cx, y, zt, BIG));
    for (let i = 0; i < 8; i++) add(block(1.08, 0.06, 0.06, PC.iron, x0 + 0.25 + (w - 0.5) * (i + 0.5) / 8, top - 0.225, zt, { turn: [0, 0, i % 2 ? 0.43 : -0.43] }));
    for (let i = 0; i < 5; i++) { const x = cx + (i - 2) * 1.7; add(block(0.3, 0.3, 0.38, PC.black, x, top - 0.72, zt, { turn: [0.5, 0, 0] }), block(0.24, 0.24, 0.05, PC.beams[i], x, top - 0.66, zt + 0.2, { turn: [0.5, 0, 0], night: true })); }
    // two loudspeakers before the corners, steps at the west end, lamps along the front edge and two monitors
    for (const x of [x0 + 0.6, x1 - 0.6]) add(block(1, 1.9, 0.85, PC.black, x, 1.1, z1 + 0.7, { edge: 0.08, name: 'speaker', ...BIG }),
      round(0.3, 0.3, 0.05, PC.cone, x, 1.5, z1 + 1.13, { turn: [Math.PI / 2, 0, 0] }), round(0.2, 0.2, 0.05, PC.cone, x, 0.72, z1 + 1.13, { turn: [Math.PI / 2, 0, 0] }));
    add(block(0.42, 0.33, 1.1, PC.plank, x0 - 0.63, 0.315, z1 - 1.2), block(0.42, 0.66, 1.1, PC.plank, x0 - 0.21, 0.48, z1 - 1.2));
    for (let i = 0; i < 6; i++) add(block(0.3, 0.12, 0.14, PC.lamp, x0 + 0.8 + (w - 1.6) * i / 5, deck + 0.06, z1 - 0.14, { night: true }));
    for (const dx of [-1.6, 1.5]) add(block(0.7, 0.3, 0.45, PC.black, cx + dx, deck + 0.15, z1 - 0.5, { turn: [0.35, 0, 0] }));
    add(pool(4.6, PC.boards, cx - 2.1, deck + 0.03, (z0 + z1) / 2 + 0.25), pool(4.6, PC.boards, cx + 2.1, deck + 0.03, (z0 + z1) / 2 + 0.25), pool(9, PC.soft, cx, 0.13, z1 + 2.3, { d: 4.4 }),
      pool(1.9, PC.halo, cx, wallTop + 0.75, z0 + 0.4));   // and a halo round the crest's star
  }

  if (has('benches')) for (const [x, z] of PARK.benches) {   // four, at the far edge of the plaza, facing the stage
    add(block(2, 0.1, 0.5, PC.wood, x, 0.55, z, { edge: 0.04, name: 'bench', ...BIG }), block(2, 0.46, 0.09, PC.wood, x, 0.88, z + 0.26, { edge: 0.04 }));
    for (const dx of [-0.8, 0.8]) add(block(0.08, 0.5, 0.5, PC.iron, x + dx, 0.32, z));
  }

  if (has('stalls')) PARK.stalls.forEach((st, i) => {   // a counter toward the plaza, a cupboard behind, a striped awning sloping to the front
    const { x, z, w, d } = st, c = PC.stalls[i], s = z + d / 2, tilt = 0.2, ay = 2.62, az = z + 0.1, deep = d + 0.7, front = az + deep / 2 * Math.cos(tilt), low = ay - deep / 2 * Math.sin(tilt);
    add(block(w, 1.08, 0.55, PC.cream, x, 0.61, s - 0.3, { edge: 0.06, name: 'counter', ...BIG }), block(w - 0.1, 0.34, 0.04, c, x, 0.74, s - 0.012),
      block(w + 0.16, 0.08, 0.7, PC.wood, x, 1.19, s - 0.3, { edge: 0.03 }), block(w - 0.3, 1.5, 0.45, PC.plank, x, 0.82, z - d / 2 + 0.3, BIG));
    for (const dx of [-1, 1]) add(block(0.1, low - 0.05, 0.1, PC.white, x + dx * (w / 2 - 0.05), (low - 0.05) / 2 + 0.07, s - 0.05), block(0.1, 2.75, 0.1, PC.white, x + dx * (w / 2 - 0.05), 1.44, z - d / 2 + 0.05));
    for (let k = 0; k < 5; k++) add(block(w / 5 + (k === 0 || k === 4 ? 0.1 : 0), 0.07, deep, k % 2 ? PC.white : c, x - w / 2 + (k + 0.5) * w / 5 + (k === 0 ? -0.05 : k === 4 ? 0.05 : 0), ay, az, { turn: [tilt, 0, 0], ...BIG }));
    add(block(w + 0.2, 0.26, 0.05, c, x, low - 0.14, front), block(w - 0.4, 0.07, 0.07, PC.lamp, x, low - 0.2, front + 0.05, { night: true }));
    // what it sells stands at the front of the counter, where the awning does not hide it: loaves, wrapped gifts, drinks
    for (let k = 0; k < 3; k++) {
      const gx = x - 0.75 + k * 0.75, gy = 1.23, gz = s - 0.16;
      if (i === 0) add(block(0.46, 0.2, 0.24, 0xd9a05b, gx, gy + 0.1, gz, { edge: 0.08 }));
      else if (i === 1) add(block(0.3, 0.26, 0.26, [0x8e5bd6, 0x2f8f83, 0xd94f8a][k], gx, gy + 0.13, gz), block(0.32, 0.05, 0.08, PC.gold, gx, gy + 0.27, gz));
      else add(round(0.1, 0.08, 0.26, [0xf2f1ec, 0xd4483b, 0xf2f1ec][k], gx, gy + 0.13, gz), round(0.11, 0.11, 0.03, 0x3d7be2, gx, gy + 0.27, gz));
    }
  });
  if (has('stalls')) {   // one long pool before the three counters: three that touched read as one white square on the pale slabs
    const [a, , c] = PARK.stalls;
    add(pool(c.x - a.x + 5, PC.soft, (a.x + c.x) / 2, 0.13, a.z + a.d / 2 + 1.05, { d: 3.4 }));
  }

  if (has('barbecue')) {   // a grill on a stone pad with its lid up, and two picnic tables on the lawn
    const [gx, gz] = PARK.grill;
    add(flat(3, 2.2, PC.slab, gx + 0.2, 0.07, gz));
    for (const [dx, dz] of [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]]) add(block(0.08, 0.8, 0.08, PC.iron, gx + dx, 0.47, gz + dz));
    add(block(1.5, 0.42, 0.75, PC.black, gx, 0.98, gz, { edge: 0.1, name: 'grill', ...BIG }), flat(1.3, 0.58, PC.grate, gx, 1.195, gz),
      block(1.2, 0.03, 0.5, PC.ember, gx, 1.2, gz, { night: true }), block(1.5, 0.08, 0.75, PC.black, gx, 1.5, gz - 0.5, { turn: [-1.15, 0, 0], edge: 0.03 }),
      block(0.55, 0.06, 0.6, PC.wood, gx + 1.05, 1.05, gz), block(0.5, 0.42, 0.36, PC.blue, gx + 1.1, 0.28, gz + 0.75, { edge: 0.05 }), block(0.52, 0.07, 0.38, PC.white, gx + 1.1, 0.52, gz + 0.75));
    for (let k = 0; k < 4; k++) add(block(0.1, 0.09, 0.36, k % 2 ? 0x9c4a36 : 0xb5533c, gx - 0.45 + k * 0.3, 1.25, gz + (k % 2 ? 0.04 : -0.04)));
    for (const [tx, tz] of PARK.tables) {
      add(block(2, 0.1, 0.8, PC.wood, tx, 0.88, tz, { edge: 0.04, name: 'table', ...BIG }));
      for (const dz of [-0.72, 0.72]) add(block(2, 0.08, 0.32, PC.wood, tx, 0.53, tz + dz, { edge: 0.03 }));
      for (const dx of [-0.75, 0.75]) add(block(0.1, 0.84, 0.1, PC.plank, tx + dx, 0.45, tz), block(0.1, 0.08, 1.7, PC.plank, tx + dx, 0.46, tz));
    }
    add(pool(4.5, PC.soft, gx + 0.2, 0.13, gz + 0.4));
  }

  if (has('masts')) for (const [x, z] of PARK.masts) {   // a mast in each corner: a pale post on a block, its wide lamp reaching in over the park
    const dx = Math.sign(mid - x), dz = Math.sign(cz - z), turn = Math.atan2(-dz, dx) + Math.PI / 2, h = 5, lx = x + dx * 0.34, lz = z + dz * 0.34;
    add(block(0.62, 0.36, 0.62, PC.slab, x, 0.32, z, { edge: 0.05 }), round(0.09, 0.13, h, PC.post, x, 0.14 + h / 2, z, BIG), block(0.3, 0.2, 0.3, PC.iron, x, h + 0.04, z),
      block(0.56, 0.18, 1.2, PC.post, lx, h + 0.1, lz, { turn: [0, turn, 0], edge: 0.06 }),
      block(0.44, 0.05, 1, PC.lamp, lx, h - 0.005, lz, { turn: [0, turn, 0], night: true }),
      block(0.3, 0.03, 0.9, PC.lamp, lx, h + 0.2, lz, { turn: [0, turn, 0], night: true }),   // a glass top: the light is seen from above
      pool(2.4, PC.halo, lx, h + 0.24, lz));   // a halo round the lamp itself
    // and its pool on the lawn. The north masts have none: one would lie on the stalls' pale court, which it bleaches, the other under the stage
    if (dz < 0) add(pool(9, PC.warm, x + dx * 2.4, 0.13, z + dz * 2.4));
  }

  if (has('lamps')) {   // strings of coloured lamps: from the stage's towers out to the masts, and from mast to mast round the sides; none across the stage's front
    const S = PARK.stage, tw = [S.x0 + 0.25, S.top, S.z1 - 0.25], te = [S.x1 - 0.25, S.top, S.z1 - 0.25], [nw, , sw, se] = PARK.masts.map(([x, z]) => [x, 5.05, z]);
    lampString(nw, tw, parts, 0); lampString(tw, sw, parts, 1); lampString(te, se, parts, 3); lampString(sw, se, parts, 4); lampString(nw, sw, parts, 2);
  }

  if (has('parking')) {   // four bays and three cars, as large as the people who came in them: one and a half times the cars of the site's own car park
    const L = PARK.parking, bays = 4, bw = (L.x1 - L.x0 - 0.4) / bays, zc = L.z1 - 2.02, y = 0.07;   // the cars' middle: their tails 0.6 m from the south edge
    add(flat(L.x1 - L.x0, L.z1 - L.z0, PC.asphalt, (L.x0 + L.x1) / 2, y, (L.z0 + L.z1) / 2, { name: 'lot' }));
    for (let i = 0; i <= bays; i++) add(flat(0.1, 3.5, PC.line, L.x0 + 0.2 + bw * i, 0.08, zc + 0.05));
    for (let i = 0; i < bays; i++) {
      const x = L.x0 + 0.2 + bw * (i + 0.5), c = PC.cars[[0, 2, 0, 3][i]];
      add(block(1.3, 0.14, 0.26, PC.kerb, x, y + 0.07, L.z0 + 0.5));   // a stop at the head of the bay
      if (i === 2) continue;   // one bay is free
      for (const dz of [-0.9, 0.9]) add(block(1.5, 0.46, 0.54, PC.tyre, x, y + 0.23, zc + dz));   // an axle's two wheels as one block: only their ends show
      add(block(1.38, 0.52, 2.85, c, x, y + 0.55, zc, { edge: 0.12, name: 'car', ...BIG }), block(1.2, 0.4, 1.5, PC.pane, x, y + 1, zc - 0.12, { edge: 0.09 }), block(1.17, 0.06, 1.38, c, x, y + 1.2, zc - 0.12),
        block(1.42, 0.12, 0.08, PC.cone, x, y + 0.4, zc + 1.42), block(0.4, 0.14, 0.03, PC.white, x, y + 0.6, zc + 1.435));   // a bumper and a number plate
      for (const dx of [-0.46, 0.46]) add(block(0.3, 0.11, 0.04, PC.red, x + dx, y + 0.66, zc + 1.43));
    }
  }

  if (has('flowers')) {   // beds in one colour each along the near fence, and a few small trees on the lawn
    PARK.beds.forEach(([x, z], i) => {
      add(block(1.5, 0.26, 0.9, PC.cream, x, 0.19, z, { edge: 0.05, name: 'bed' }), flat(1.3, 0.7, PC.soil, x, 0.325, z));
      for (const dx of [-0.42, 0, 0.42]) add(ball(0.23, PC.beds[i % PC.beds.length], x + dx, 0.5, z + 0.05));
      for (const dx of [-0.21, 0.21]) add(ball(0.17, PC.leaves[0], x + dx, 0.44, z - 0.2));
    });
    PARK.trees.forEach(([x, z], i) => add(round(0.45, 0.45, 0.02, PC.soil, x, 0.075, z), block(0.18, 1.3, 0.18, PC.trunk, x, 0.7, z, { name: 'tree' }),
      ball(0.95, PC.leaves[i % 3], x, 2.05, z, { sy: 0.85, ...BIG }), ball(0.55, PC.leaves[(i + 1) % 3], x + 0.42, 2.4, z + 0.2)));
  }

  if (!lit) return parts;
  for (const q of parts) if (q.night && q.kind !== 'pool') q.glow = true;   // the lamps are lit whatever the hour
  const S = PARK.stage, band = (CROWDS[activity] || CROWDS.festival).band > 0 && has('stage');
  if (band) {   // spotlights from the truss onto the band, coloured pools on the stage and the plaza, a keyboard and a microphone
    const cx = (S.x0 + S.x1) / 2, [mx, mz] = PARK.medal;
    for (let i = 0; i < 5; i++) { const x = cx + (i - 2) * 1.7; add({ kind: 'beam', w: 2.2, color: PC.beams[i], at: [x, S.top - 0.75, S.z1 - 0.2], to: [cx + (i - 2) * 1.35, S.deck + 0.05, S.z1 - 1.9], show: true }); }
    add(pool(4.4, PC.beams[0], cx - 2.2, S.deck + 0.04, (S.z0 + S.z1) / 2 + 0.3, { show: true }), pool(4.4, PC.beams[1], cx + 2.2, S.deck + 0.04, (S.z0 + S.z1) / 2 + 0.3, { show: true }),
      pool(7, PC.floor[0], mx - 3, 0.14, mz - 1, { show: true }), pool(7, PC.floor[1], mx + 3.2, 0.14, mz - 0.6, { show: true }), pool(6.5, PC.floor[2], mx, 0.14, mz + 1.6, { show: true }),
      block(1.5, 0.1, 0.5, PC.white, cx + 0.95, S.deck + 1.02, S.z1 - 1.85, { show: true }), block(0.08, 1, 0.08, PC.iron, cx + 0.95, S.deck + 0.5, S.z1 - 1.85, { show: true }),
      block(0.05, 1.45, 0.05, PC.iron, cx - 0.3, S.deck + 0.72, S.z1 - 0.38, { show: true }));
  } else if (has('barbecue')) add(pool(6, PC.ember, PARK.grill[0], 0.14, PARK.grill[1] + 0.6, { show: true }));
  if (crowd <= 0) return parts;
  const people = parkCrowd(has, activity, crowd);
  add(...people);
  // one soft dark patch on the ground under every figure, as under the player and the shops' customers: nobody floats on the pale slabs
  for (const f of people) add({ kind: 'shade', size: +(1.5 * f.size).toFixed(2), color: PC.shade, at: [f.at[0], f.at[1] + (f.at[1] > 0.5 ? 0.06 : 0.135), f.at[2]], show: true });
  for (const f of people) if (f.pose === 'cook') {   // the cook's tall white hat: a band and a crown, on a head no taller than anybody's
    const [x, , z] = f.at;
    add(block(0.6, 0.16, 0.6, PC.white, x, 2.02, z, { show: true }), block(0.5, 0.5, 0.5, PC.white, x, 2.33, z, { edge: 0.1, show: true }), block(0.62, 0.2, 0.62, PC.white, x, 2.62, z, { edge: 0.09, show: true }));
  }
  return parts;
}

/** The footprints of the park nobody walks through, for the layers that are to be seen. */
export function parkBlocks(shown, works) {
  const out = [], rect = (x0, x1, z0, z1) => out.push({ minX: x0 - PAD, maxX: x1 + PAD, minZ: z0 - PAD, maxZ: z1 + PAD, build: 'park' }), has = name => shown.includes(name);
  const around = ([x, z], hx, hz) => rect(x - hx, x + hx, z - hz, z + hz);
  if (works) { around(PARK.works.pallet, 0.6, 0.6); around(PARK.works.heap, 0.9, 0.9); }
  if (has('gate')) for (const x of PARK.gate) around([x, SITE.park.minZ + 0.18], 0.18, 0.18);
  if (has('stage')) { const S = PARK.stage; rect(S.x0 - 0.85, S.x1, S.z0, S.z1); for (const x of [S.x0 + 0.6, S.x1 - 0.6]) rect(x - 0.5, x + 0.5, S.z1, S.z1 + 1.15); }
  if (has('benches')) { const [[x0, z], [x1]] = [PARK.benches[0], PARK.benches.at(-1)]; rect(x0 - 1, x1 + 1, z - 0.3, z + 0.3); }   // the row as one: a gap between two benches is too narrow to walk through
  if (has('stalls')) for (const st of PARK.stalls) rect(st.x - st.w / 2, st.x + st.w / 2, st.z - st.d / 2, st.z + st.d / 2);
  if (has('barbecue')) { around(PARK.grill, 0.75, 0.4); for (const t of PARK.tables) around(t, 1, 0.9); }
  if (has('masts')) for (const m of PARK.masts) around(m, 0.1, 0.1);
  if (has('parking')) { const L = PARK.parking; rect(SITE.park.minX, L.x1 - 0.2, L.z0 + 0.6, L.z1 - 0.3); }   // out to the fence: no dead-end strip west of the cars
  if (has('flowers')) { for (const b of PARK.beds) around(b, 0.75, 0.45); for (const t of PARK.trees) around(t, 0.1, 0.1); }
  return out;
}

/** Whether a point of the ground ({ x, z }) lies on the park's plot: a tap there opens the park's card. */
export const atPark = p => p.x >= SITE.park.minX && p.x <= SITE.park.maxX && p.z >= SITE.park.minZ && p.z <= SITE.park.maxZ;

/**
 * Where a festival's rockets burst: a strip along the park's south fence, and between which heights. The camera looks
 * north and down, so a burst h up is seen over the ground h / SIGHT.slope further north: these are seen over the south
 * lawn and the fence, the darkest ground of the picture, and not on the sand behind the cards.
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number, low: number, high: number }}
 */
export const parkSky = () => ({ minX: SITE.park.minX + 2, maxX: SITE.park.maxX - 2, minZ: SITE.park.maxZ - 1, maxZ: SITE.park.maxZ + 5, low: 8, high: 10 });

/** Where the grill's smoke rises from: [x, y, z]. Its west end: the wind takes the smoke west, and the cook behind the grill stays in sight. */
export const parkSmoke = () => [PARK.grill[0] - 0.5, 1.35, PARK.grill[1]];

/** An activity's picture lasts this long. It is a picture only: no rule waits for it. */
export const SHOW_SECONDS = 150;
/**
 * The picture of an activity at a moment of the clock on the wall, or null when none runs: so a page that was away
 * comes back to a quiet park, however long it was gone.
 * @param show  { id, from }: which activity, and the moment (ms) its picture began; or null
 * @param now   the moment (ms), on the same clock
 * @returns {{ id: string, t: number, left: number } | null}  seconds since it began, and seconds left
 */
export function parkShowAt(show, now) {
  if (!show) return null;
  const t = (now - show.from) / 1000;
  return t >= 0 && t < SHOW_SECONDS ? { id: show.id, t, left: SHOW_SECONDS - t } : null;
}

/**
 * Whether the sign is held in sight and lists its goods: for a player on the ground the sign belongs to. The park's
 * sign is held from the lane on south, so a player on the site does not find it laid over the site's own buildings.
 * @param sign  what siteSign returns  @param onSite  the player is on the building site or in the park  @param z  where they stand
 */
export const signNear = (sign, onSite, z) => !!sign && onSite && (sign.build !== 'park' || z > SITE.plot.maxZ);
