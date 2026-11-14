// Shop models: the counter a yard sells its goods over. Nine bodies, one for each kind of trade, so that the shop of
// one yard is not the shop of the next: a log trading post, a market stall under striped cloth, a counter of stone and
// brick, a joiner's shop front with an awning, a steel weigh desk, a fuel depot on drums, a jeweller's display case, a
// concrete dispatch dock and a white showroom counter. Which yard gets which is in js/data/looks.js (SHOP_BODY); every
// body is painted in the yard's own four colours (counter, top, board, stripe) and shows the yard's own product.
//
// The layout, in the shop's own space. The customer's pad lies around the middle, the counter south of it, and the
// camera looks down from further south (+z), so what it sees of a shop is the counter's top and its south side:
//   - the counter's top is 5.2 by 1.8 with its middle at z = 2.3 and its surface at COUNTER_TOP, where js/stations.js
//     slides the goods across (x -0.6..0.8, from the north edge over the south one) and lets a coin jump out of the
//     till at x = 1.5; a sample of the product lies at x = -1.2. Those stay clear; the west end of the top is free;
//   - a body fills the ground nobody walks through (x ±2.75, z 1.45..3.35) and may stand a little past it to the south,
//     but not past x ±3: customers come to both ends of the counter;
//   - nothing tall spans the counter on the camera's side: it would be drawn over the top. Signs are low, on the south
//     side; what stands tall (a lamp post, a sign post, a pump) stands at the two south corners.
//
// A body is built from the parts kit (js/gfx/kit.js) in a handful of surfaces, so the station can join it into a few
// meshes (js/engine/bake.js). Only the till is left apart: it jumps on a sale. Nothing here knows the rules of the game.
import * as THREE from 'three';
import { box, lit } from '../world.js';
import { wood } from '../textures.js';
import { stackStep } from '../items3d.js';
import { shade } from '../models.js';
import { productShape } from './products.js';
import { INK, STEEL, BRASS, PANEL, GLASS, GEO, put, block, rod, part, pivot, rig, pipe, hazard, pile, glowing, lantern } from './kit.js';

/** The height of the counter's surface: goods slide over it (js/stations.js). */
export const COUNTER_TOP = 1.43;
/** Where the till stands on the counter, and where the sample of the product lies. */
export const TILL_AT = { x: 1.5, y: 1.4, z: 2.3 }, SAMPLE_AT = { x: -1.2, y: 1.45, z: 2.3 };
const TOP = COUNTER_TOP, Z = 2.3, CLOTH = 0xf6efe0, SOUTH = 3.2;   // SOUTH: the edge of the top on the camera's side

/** The counter's top, 0.15 thick, its surface at COUNTER_TOP. */
const slab = (g, color, o, w = 5.2) => block(g, w, 0.15, 1.8, color, 0, TOP - 0.075, Z, o);
const brighter = hex => { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.6 + c.b * 0.1; };

// ------------------------------------------------------------------ the product on show
const _size = new THREE.Vector3();
/** How one item of `type` fits a place w wide (along x) and d deep: turned a quarter if that suits it, and no bigger than life. */
function fit(type, w, d, h = 9) {
  const geo = productShape(type).geo;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const s = geo.boundingBox.getSize(_size), turn = (s.x > s.z * 1.05) !== (w > d) ? Math.PI / 2 : 0;
  const wide = turn ? s.z : s.x, deep = turn ? s.x : s.z;
  const k = Math.min(1, w / wide, d / deep, h / s.y);
  return { turn, k, wide: wide * k, deep: deep * k, step: stackStep(type) * k };
}
/** A small show of the product on a surface at (x, y, z): rows side by side along z, fewer in each layer above. */
function show(st, x, y, z, w = 0.72, d = 1.3) {
  const f = fit(st.item, w, d), cols = Math.max(1, Math.min(3, Math.floor(d / (f.deep + 0.05))));
  const layers = cols > 1 ? Math.min(cols, Math.max(1, Math.floor(0.8 / f.step))) : Math.max(1, Math.min(4, Math.floor(0.6 / f.step)));
  for (let l = 0; l < layers; l++) {
    const n = cols > 1 ? cols - l : 1;
    for (let i = 0; i < n; i++) st.stock.push([x, y + l * f.step, z + (i - (n - 1) / 2) * (f.deep + 0.05), f.turn + (l % 2 ? 0.07 : -0.05), f.k]);
  }
}
/** A row of the product along x, each made to fit a place w by d (and no taller than h). */
function row(st, xs, y, z, w, d, h) {
  const f = fit(st.item, w, d, h);
  for (const x of xs) st.stock.push([x, y, z, f.turn, f.k]);
}
/** An open box on the ground behind the counter, where what was sold lands: two of it lie inside. */
function bin(g, st, x, z, color, { w = 0.95, d = 0.46, h = 0.8, o } = {}) {
  const t = 0.06, floor = h * 0.5;
  for (const s of [-1, 1]) {
    block(g, t, h, d, color, x + s * (w - t) / 2, h / 2, z, o);
    block(g, w - t * 2, h, t, color, x, h / 2, z + s * (d - t) / 2, o);
  }
  block(g, w - t * 2, 0.04, d - t * 2, INK.dark, x, floor, z);
  const f = fit(st.item, (w - 0.2) * 0.85, (d - 0.16) * 0.85, h * 0.6);
  st.stock.push([x - 0.04, floor + 0.02, z, f.turn + 0.12, f.k], [x + 0.05, floor + 0.02 + f.step, z, f.turn - 0.16, f.k]);
}

// ------------------------------------------------------------------ tills
// A till is built into a group that stands on the counter (its foot at y = 0.03) and is about 0.85 tall: the coin of a
// sale comes out of its top. Its face is turned south, to whoever serves, which is also the side the camera sees.
const TILLS = {
  /** A shop till: a drawer, a body with a bank of keys, and the window the price shows in. */
  register(t, body, trim = INK.dark) {
    block(t, 1.1, 0.24, 0.9, trim, 0, 0.15, 0, { round: 0.04 });
    block(t, 0.96, 0.4, 0.62, body, 0, 0.47, -0.12, { round: 0.1 });
    block(t, 0.8, 0.07, 0.36, INK.cream, 0, 0.4, 0.27).rotation.x = 0.4;
    block(t, 0.72, 0.22, 0.14, trim, 0, 0.77, -0.28, { round: 0.03 });
    block(t, 0.56, 0.12, 0.02, INK.cream, 0, 0.78, -0.2);
    block(t, 0.05, 0.3, 0.05, INK.steel, 0.53, 0.5, -0.05);
    block(t, 0.1, 0.1, 0.1, 0xd63a2f, 0.53, 0.68, -0.05, { round: 0.04 });
  },
  /** A platform scale: a steel plate to weigh on and a dial on a column behind it. */
  scale(t, body) {
    block(t, 1.06, 0.14, 0.9, body, 0, 0.1, 0, { round: 0.03 });
    block(t, 0.92, 0.05, 0.62, INK.steel, 0, 0.195, 0.1);
    block(t, 0.16, 0.5, 0.14, body, 0, 0.42, -0.34);
    rod(t, 0.29, 0.14, body, 0, 0.66, -0.34, 'z', undefined, 14);
    rod(t, 0.23, 0.03, INK.cream, 0, 0.66, -0.26, 'z', undefined, 14);
    block(t, 0.035, 0.2, 0.02, 0xd63a2f, 0.05, 0.71, -0.24).rotation.z = -0.5;
  },
  /** A balance: two pans on a brass beam. */
  balance(t, body) {
    block(t, 0.84, 0.1, 0.5, body, 0, 0.08, 0, { round: 0.03 });
    rod(t, 0.045, 0.66, INK.gold, 0, 0.46, 0, 'y', BRASS, 8);
    block(t, 1.02, 0.05, 0.06, INK.gold, 0, 0.78, 0, BRASS);
    part(t, GEO.ball(0.07, 8), INK.gold, 0, 0.84, 0, BRASS);
    for (const s of [-1, 1]) {
      rod(t, 0.014, 0.36, INK.gold, s * 0.46, 0.6, 0, 'y', BRASS, 5);
      rod(t, 0.21, 0.035, INK.gold, s * 0.46, 0.41, 0, 'y', BRASS, 12, 0.14);
    }
  },
  /** A pump's meter: a cabinet with a dial and two windows of figures. */
  meter(t, body) {
    block(t, 0.96, 0.74, 0.56, body, 0, 0.4, -0.08, { round: 0.07 });
    block(t, 1.0, 0.07, 0.6, INK.dark, 0, 0.8, -0.08);
    rod(t, 0.2, 0.04, INK.cream, -0.2, 0.5, 0.21, 'z', undefined, 12);
    block(t, 0.03, 0.17, 0.02, 0xd63a2f, -0.17, 0.54, 0.235).rotation.z = -0.6;
    for (const y of [0.6, 0.4]) block(t, 0.3, 0.13, 0.02, INK.cream, 0.24, y, 0.21);
    block(t, 0.16, 0.2, 0.2, INK.dark, 0.56, 0.42, 0);
  },
  /** A terminal: a lit screen on a stem, tilted up to whoever serves. */
  terminal(t, body, glow = 0x7fe8ff) {
    block(t, 0.74, 0.08, 0.6, INK.dark, 0, 0.07, 0, { round: 0.03 });
    block(t, 0.12, 0.46, 0.1, INK.dark, 0, 0.32, -0.14);
    const head = pivot(t, 0, 0.6, -0.04); head.rotation.x = -0.55;
    block(head, 0.92, 0.56, 0.07, body, 0, 0, 0, { round: 0.03 });
    put(head, lit(box(0.78, 0.42, 0.02, 0xdff6ff, { map: null }), glow, 0.5), 0, 0, 0.04);
    block(t, 0.3, 0.05, 0.2, body, 0.2, 0.135, 0.14);
  },
};

// ------------------------------------------------------------------ the bodies
// Each builds into `g` in the paint `p` { counter, top, board, stripe }, puts its till into the group `till`, and lists
// the copies of the product it shows in `st.stock` (they are drawn together, in one go).
const BODIES = {
  /** A log trading post: a counter of stacked logs under a painted plank top, a sign nailed to its side. */
  post(g, p, st, till) {
    const LOG = 0xa9743f, END = 0xe2c08d;
    block(g, 4.4, 1.2, 1.1, 0x5a3d26, 0, 0.6, Z);
    for (let i = 0; i < 4; i++) {
      const y = 0.17 + i * 0.31;
      for (const z of [1.66, 2.94]) { rod(g, 0.165, 5.1, LOG, 0, y, z, 'x'); for (const s of [-1, 1]) rod(g, 0.11, 0.02, END, s * 2.56, y, z, 'x'); }
      if (i < 3) for (const s of [-1, 1]) { rod(g, 0.165, 1.9, LOG, s * 2.3, y + 0.155, Z, 'z'); for (const e of [-1, 1]) rod(g, 0.11, 0.02, END, s * 2.3, y + 0.155, Z + e * 0.96, 'z'); }
    }
    slab(g, p.counter, wood({ rx: 2 }));
    block(g, 5.26, 0.11, 0.07, p.top, 0, 1.35, SOUTH + 0.015);
    block(g, 1.9, 0.66, 0.07, p.board, -1.4, 0.66, 3.17, { round: 0.03 });
    block(g, 1.9, 0.14, 0.09, p.stripe, -1.4, 0.48, 3.17);
    for (const s of [-1, 1]) block(g, 0.06, 0.3, 0.04, INK.dark, -1.4 + s * 0.8, 1.1, 3.15);
    bin(g, st, 0.07, 3.5, 0xb98a55);
    rod(g, 0.12, 2.9, LOG, -2.8, 1.45, 3.34); lantern(g, -2.8, 3.1, 3.34);
    rod(g, 0.12, 1.75, LOG, 2.8, 0.875, 3.34); block(g, 0.36, 0.1, 0.36, p.top, 2.8, 1.8, 3.34, { round: 0.03 });
    rod(g, 0.28, 0.46, LOG, 1.75, 0.23, 3.5, 'y', undefined, 12); rod(g, 0.24, 0.02, END, 1.75, 0.47, 3.5, 'y', undefined, 12);   // a chopping block with an axe in it
    block(g, 0.05, 0.6, 0.05, 0xc9a26b, 1.86, 0.74, 3.5).rotation.z = -0.5;
    block(g, 0.22, 0.14, 0.04, INK.steel, 1.72, 0.53, 3.5).rotation.z = -0.5;
    show(st, -2.12, TOP, Z);
    TILLS.register(till, p.board, 0x5a3d26);
  },

  /** A market stall: a trestle table under striped cloth, crates behind it and a board of prices on the ground. */
  stall(g, p, st, till) {
    for (const x of [-2.25, 2.25]) for (const z of [1.72, 2.88]) block(g, 0.12, 1.26, 0.12, INK.wood, x, 0.63, z);
    block(g, 4.5, 0.1, 0.1, INK.wood, 0, 0.4, 2.88);
    block(g, 5.1, 0.08, 1.7, INK.wood, 0, 1.3, Z);
    const n = 10, w = 5.2 / n;
    for (let i = 0; i < n; i++) {
      const c = i % 2 ? CLOTH : p.counter, x = -2.6 + w * (i + 0.5), drop = i % 2 ? 0.6 : 0.74;
      block(g, w, 0.09, 1.8, c, x, TOP - 0.045, Z);
      block(g, w, drop, 0.04, c, x, TOP - 0.02 - drop / 2, SOUTH + 0.015);
    }
    for (const s of [-1, 1]) block(g, 0.04, 0.5, 1.8, p.top, s * 2.615, 1.16, Z);
    bin(g, st, -1.75, 3.5, 0xb98a55);
    bin(g, st, 0.07, 3.5, 0xc79a63);
    const sign = pivot(g, 1.75, 0, 3.66); sign.rotation.x = -0.27;                    // a board of prices, leaning on its own legs
    block(sign, 0.9, 1.0, 0.05, p.board, 0, 0.5, 0, { round: 0.02 });
    block(sign, 0.72, 0.36, 0.02, 0x3a4a44, 0, 0.64, 0.03);
    block(sign, 0.72, 0.13, 0.02, p.stripe, 0, 0.26, 0.03);
    block(g, 0.86, 0.95, 0.05, shade(p.board, 0.8), 1.75, 0.47, 3.4).rotation.x = 0.2;
    for (const s of [-1, 1]) {
      block(g, 0.07, 2.5, 0.07, INK.wood, s * 2.66, 1.25, 3.3);
      block(g, 0.42, 0.24, 0.03, p.stripe, s * 2.9, 2.34, 3.3);
    }
    lantern(g, -2.66, 2.68, 3.3);
    block(g, 0.16, 0.08, 0.16, p.top, 2.66, 2.54, 3.3);
    show(st, -2.12, TOP, Z);
    TILLS.balance(till, p.top);
  },

  /** A counter of dressed stone between two brick piers, under a slab. */
  masonry(g, p, st, till) {
    const stone = [p.counter, shade(p.counter, 1.2), shade(p.counter, 0.84)], BRICK = [INK.brick, shade(INK.brick, 0.85)];
    block(g, 4.6, 1.26, 1.5, shade(p.counter, 0.62), 0, 0.63, Z - 0.02);
    const course = (y, h, xs, k) => { for (let i = 0; i + 1 < xs.length; i++) block(g, xs[i + 1] - xs[i] - 0.04, h - 0.04, 0.2, stone[(i + k) % 3], (xs[i] + xs[i + 1]) / 2, y, 3.02, { round: 0.035 }); };
    course(0.22, 0.44, [-2.27, -1.45, -0.6, 0.3, 1.2, 2.27], 0);
    course(0.65, 0.42, [-2.27, -1.85, -0.95, -0.05, 0.9, 1.7, 2.27], 1);
    course(1.07, 0.42, [-2.27, -1.3, -0.4, 0.55, 1.4, 2.27], 2);
    for (const s of [-1, 1]) {
      const rows = s < 0 ? 8 : 10, x = s * 2.56, h = rows * 0.21;
      for (let i = 0; i < rows; i++) block(g, 0.58, 0.21, 1.64, BRICK[i % 2], x, 0.105 + i * 0.21, 2.32);
      block(g, 0.68, 0.1, 1.74, shade(p.counter, 1.25), x, h + 0.05, 2.32, { round: 0.03 });
      if (s > 0) lantern(g, x, h + 0.3, 2.95);
    }
    slab(g, p.top, { round: 0.04 }, 4.54);
    block(g, 1.5, 0.52, 0.06, p.board, -1.3, 0.78, 3.15, { round: 0.03 });
    block(g, 1.5, 0.12, 0.08, p.stripe, -1.3, 0.62, 3.15);
    const t = 0.08;                                                                   // a stone trough for what was sold
    for (const s of [-1, 1]) { block(g, t, 0.7, 0.5, stone[1], 0.07 + s * 0.46, 0.35, 3.48); block(g, 0.84, 0.7, t, stone[1], 0.07, 0.35, 3.48 + s * 0.21); }
    block(g, 0.84, 0.04, 0.36, INK.dark, 0.07, 0.4, 3.48);
    row(st, [0.07], 0.42, 3.48, 0.6, 0.3, 0.4);
    block(g, 0.66, 0.36, 0.42, stone[0], 1.6, 0.18, 3.46, { round: 0.04 });           // blocks left over from building it
    block(g, 0.5, 0.3, 0.38, stone[2], 1.68, 0.51, 3.44, { round: 0.04 }).rotation.y = 0.3;
    show(st, -2.56, 8 * 0.21 + 0.1, Z, 0.46, 1.3);
    TILLS.register(till, INK.iron, INK.dark);
  },

  /** A joiner's shop front: a panelled counter with a striped awning on the camera's side and a sign on a post. */
  front(g, p, st, till) {
    block(g, 5.0, 0.16, 1.62, shade(p.top, 0.55), 0, 0.08, Z);
    block(g, 4.9, 1.12, 1.56, p.counter, 0, 0.72, Z, { round: 0.04 });
    for (const x of [-2.38, -1.19, 0, 1.19, 2.38]) block(g, 0.18, 1.12, 0.07, p.top, x, 0.72, 3.09);
    slab(g, p.top, wood({ rx: 2 }));
    const n = 9, w = 5.04 / n;
    for (let i = 0; i < n; i++) {
      const c = i % 2 ? CLOTH : p.board, x = -2.52 + w * (i + 0.5);
      block(g, w, 0.05, 0.6, c, x, 1.12, 3.47).rotation.x = 0.5;
      block(g, w, 0.17, 0.04, c, x, 0.9, 3.735);
    }
    block(g, 0.14, 2.7, 0.14, p.board, 2.74, 1.35, 3.3); lantern(g, 2.74, 2.9, 3.3);
    block(g, 0.12, 2.3, 0.12, p.board, -2.74, 1.15, 3.3);                             // the sign on its post
    block(g, 0.86, 0.6, 0.07, p.board, -2.74, 2.5, 3.3, { round: 0.06 });
    block(g, 0.7, 0.44, 0.03, CLOTH, -2.74, 2.5, 3.34, { round: 0.04 });
    block(g, 0.7, 0.1, 0.04, p.top, -2.74, 2.36, 3.345);
    show(st, -2.12, TOP, Z);
    TILLS.register(till, INK.gold, p.board);
  },

  /** A weigh desk: a steel desk with a plate front in the yard's paint, a platform scale, test weights and a load sign. */
  weigh(g, p, st, till) {
    block(g, 5.0, 0.12, 1.62, INK.iron, 0, 0.06, Z);
    block(g, 4.8, 1.16, 1.4, INK.iron, 0, 0.7, Z - 0.05);
    block(g, 4.9, 1.0, 0.08, p.counter, 0, 0.74, 3.06, PANEL());
    for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) block(g, 0.1, 1.0, 0.06, shade(p.counter, 0.72), x, 0.74, 3.12);
    hazard(g, 4.9, 0, 0.18, 3.11, 0.14, 14);
    slab(g, p.top, PANEL());
    block(g, 5.26, 0.11, 0.07, INK.steel, 0, 1.35, SOUTH + 0.015);
    block(g, 1.0, 0.5, 0.05, p.board, -1.8, 0.8, 3.14, { round: 0.03 });
    block(g, 1.0, 0.12, 0.07, p.stripe, -1.8, 0.65, 3.14);
    bin(g, st, 0.07, 3.5, shade(p.counter, 0.85), { h: 0.7 });
    rod(g, 0.06, 3.0, INK.iron, -2.8, 1.5, 3.34, 'y', undefined, 8); lantern(g, -2.8, 3.16, 3.34);   // the post with the load sign
    rod(g, 0.38, 0.06, 0xd63a2f, -2.8, 2.5, 3.36, 'z', undefined, 16);
    rod(g, 0.29, 0.07, INK.white, -2.8, 2.5, 3.37, 'z', undefined, 16);
    block(g, 0.3, 0.09, 0.02, INK.dark, -2.8, 2.5, 3.41);
    for (const [x, z, n] of [[1.55, 3.5, 3], [2.1, 3.56, 2]]) {                       // test weights for the scale
      for (let i = 0; i < n; i++) rod(g, 0.25 - i * 0.03, 0.14, INK.iron, x, 0.07 + i * 0.14, z, 'y', undefined, 12);
      block(g, 0.2, 0.08, 0.05, INK.steel, x, n * 0.14 + 0.04, z);
    }
    rod(g, 0.1, 1.0, INK.hazard, 2.82, 0.5, 3.36, 'y', undefined, 10); rod(g, 0.105, 0.2, INK.dark, 2.82, 0.75, 3.36, 'y', undefined, 10);
    show(st, -2.12, TOP, Z);
    TILLS.scale(till, p.board);
  },

  /** A fuel depot's desk: a deck on a row of drums, a pump at one corner and a board on legs. */
  depot(g, p, st, till) {
    block(g, 5.3, 0.14, 1.86, INK.concrete, 0, 0.07, Z);
    block(g, 4.7, 1.12, 1.0, INK.dark, 0, 0.7, 2.05);
    for (let i = 0; i < 5; i++) {
      const x = -2.08 + i * 1.04, c = i % 2 ? INK.iron : p.counter;
      rod(g, 0.44, 1.12, c, x, 0.7, 2.66, 'y', undefined, 14);
      for (const y of [0.42, 0.98]) rod(g, 0.456, 0.06, shade(c, 0.72), x, y, 2.66, 'y', undefined, 14);
    }
    slab(g, p.top, PANEL());
    hazard(g, 5.2, 0, 1.355, SOUTH + 0.01, 0.13, 14);
    const x = -2.62, z = 3.44;                                                       // the pump: its globe is the shop's lantern
    block(g, 0.62, 1.7, 0.5, p.counter, x, 0.99, z, { round: 0.06 });
    block(g, 0.5, 0.56, 0.04, INK.white, x, 1.3, z + 0.25);
    rod(g, 0.17, 0.03, INK.cream, x, 1.36, z + 0.28, 'z', undefined, 12);
    block(g, 0.03, 0.14, 0.02, 0xd63a2f, x + 0.03, 1.39, z + 0.3).rotation.z = -0.6;
    block(g, 0.7, 0.16, 0.58, INK.white, x, 1.92, z, { round: 0.04 });
    lantern(g, x, 2.2, z, { s: 1.15 });
    pipe(g, [[x + 0.31, 1.55, z + 0.1], [x + 0.56, 1.55, z + 0.1], [x + 0.56, 0.62, z + 0.1], [x + 0.36, 0.62, z + 0.1]], 0.04, INK.rubber);
    rod(g, 0.34, 0.78, shade(p.counter, 0.9), 0.07, 0.39, 3.56, 'y', undefined, 14);   // an open drum for what was sold
    rod(g, 0.29, 0.02, INK.dark, 0.07, 0.785, 3.56, 'y', undefined, 14);
    for (const s of [-1, 1]) block(g, 0.07, 0.9, 0.07, INK.iron, 1.75 + s * 0.6, 0.45, 3.5);
    block(g, 1.4, 0.5, 0.06, p.board, 1.75, 0.72, 3.54, { round: 0.03 });
    block(g, 1.4, 0.12, 0.08, p.stripe, 1.75, 0.57, 3.54);
    rod(g, 0.1, 0.5, 0xd63a2f, 2.84, 0.25, 3.4, 'y', undefined, 10); rod(g, 0.05, 0.14, INK.dark, 2.84, 0.57, 3.4, 'y', undefined, 8);   // a fire extinguisher
    show(st, -2.12, TOP, Z);
    TILLS.meter(till, p.board);
  },

  /** A jeweller's display case: velvet under glass in a brass frame, stanchions and a rope behind it. */
  showcase(g, p, st, till) {
    const GOLD = INK.gold, VELVET = shade(p.top, 0.9);
    block(g, 5.1, 0.14, 1.7, GOLD, 0, 0.07, Z, BRASS);
    block(g, 4.96, 0.94, 1.6, p.counter, 0, 0.61, Z, { round: 0.05 });
    block(g, 4.9, 0.05, 1.54, VELVET, 0, 1.105, Z);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) block(g, 0.08, 0.36, 0.08, GOLD, sx * 2.52, 1.25, Z + sz * 0.83, BRASS);
      block(g, 0.08, 0.07, 1.74, GOLD, sx * 2.52, 1.39, Z, BRASS);
    }
    for (const sz of [-1, 1]) block(g, 5.12, 0.07, 0.08, GOLD, 0, 1.39, Z + sz * 0.83, BRASS);
    const glass = put(g, box(5.0, 0.3, 1.62, INK.glass, { ...GLASS, opacity: 0.26 }), 0, TOP - 0.15, Z); glass.castShadow = false;
    // what the case holds: two rows of the product on small cushions
    const xs = [-2.1, -1.5, -0.9, 0.45, 0.95, 2.1];
    for (const z of [1.82, 2.78]) {
      for (const x of xs) block(g, 0.42, 0.04, 0.42, p.board, x, 1.15, z, { round: 0.02 });
      row(st, xs, 1.17, z, 0.34, 0.34, 0.24);
    }
    block(g, 1.5, 0.5, 0.05, p.board, -1.35, 0.6, 3.12, { round: 0.05 });
    block(g, 1.62, 0.62, 0.03, GOLD, -1.35, 0.6, 3.105, BRASS);
    const gem = part(g, GEO.gem(0.2), p.stripe, -1.35, 0.6, 3.16); gem.scale.set(1, 1.15, 0.4);
    block(g, 4.96, 0.05, 0.04, GOLD, 0, 1.0, 3.11, BRASS);
    const t = 0.05;                                                                   // a lined box for what was sold
    for (const s of [-1, 1]) { block(g, t, 0.62, 0.44, p.counter, 0.07 + s * 0.45, 0.31, 3.5); block(g, 0.86, 0.62, t, p.counter, 0.07, 0.31, 3.5 + s * 0.2); }
    block(g, 0.86, 0.04, 0.36, VELVET, 0.07, 0.36, 3.5);
    row(st, [0.07], 0.38, 3.5, 0.5, 0.28, 0.36);
    const post = (x, h = 0.95) => { rod(g, 0.045, h, GOLD, x, h / 2, 3.5, 'y', BRASS, 8); rod(g, 0.16, 0.05, GOLD, x, 0.025, 3.5, 'y', BRASS, 10); part(g, GEO.ball(0.08, 8), GOLD, x, h + 0.05, 3.5, BRASS); };
    for (const x of [-0.75, 0.9, 2.8]) post(x);
    rod(g, 0.045, 2.5, GOLD, -2.8, 1.25, 3.5, 'y', BRASS, 8); rod(g, 0.18, 0.06, GOLD, -2.8, 0.03, 3.5, 'y', BRASS, 10);   // the lamp at the corner
    lantern(g, -2.8, 2.68, 3.5);
    for (const [a, b] of [[-2.8, -0.75], [0.9, 2.8]]) pipe(g, [[a, 0.86, 3.5], [(a * 2 + b) / 3, 0.7, 3.5], [(a + b * 2) / 3, 0.7, 3.5], [b, 0.86, 3.5]], 0.035, p.counter);
    show(st, -2.18, TOP, 2.3, 0.5, 0.5);
    TILLS.register(till, GOLD, p.top);
  },

  /** A dispatch dock: a concrete dock with rubber bumpers, a lane of rollers across its deck, bollards and a beacon. */
  dock(g, p, st, till) {
    block(g, 5.2, 1.16, 1.7, INK.concrete, 0, 0.58, Z);
    block(g, 5.1, 0.12, 1.7, INK.iron, 0, 1.22, Z);
    slab(g, p.top, PANEL());
    for (const x of [-2.25, -0.75, 0.9, 2.25]) block(g, 0.3, 0.74, 0.12, INK.rubber, x, 0.55, 3.2, { round: 0.04 });
    hazard(g, 5.2, 0, 1.2, 3.17, 0.14, 14);
    block(g, 1.1, 0.5, 0.05, p.board, -1.5, 0.6, 3.17, { round: 0.03 });
    block(g, 1.1, 0.12, 0.07, p.stripe, -1.5, 0.45, 3.17);
    for (let i = 0; i < 8; i++) rod(g, 0.045, 1.3, INK.steel, 0.08, TOP - 0.042, 1.5 + i * 0.228, 'x', STEEL, 8);   // the lane the goods roll over
    for (const s of [-1, 1]) block(g, 0.05, 0.05, 1.8, p.counter, 0.08 + s * 0.7, TOP + 0.02, Z);
    bin(g, st, 0.08, 3.52, p.counter, { w: 1.1, h: 0.74, o: PANEL() });
    for (const s of [-1, 1]) {
      rod(g, 0.11, 1.0, INK.hazard, s * 2.84, 0.5, 3.42, 'y', undefined, 10);
      for (const y of [0.34, 0.72]) rod(g, 0.115, 0.14, INK.dark, s * 2.84, y, 3.42, 'y', undefined, 10);
    }
    rod(g, 0.05, 2.1, INK.iron, -2.84, 2.05, 3.42, 'y', undefined, 8);                // the beacon: the shop's lantern
    lantern(g, -2.84, 3.24, 3.42, { glow: 0xffb030, pane: 0xffc24a, byDay: 0.35 });
    show(st, -2.12, TOP, Z);
    TILLS.terminal(till, p.counter);
  },

  /** A showroom counter: white and smooth with a lit line, a glass case of the product at one corner and a sign pylon at the other. */
  showroom(g, p, st, till) {
    const GRAPHITE = 0x2b3038, lightOf = brighter(p.stripe) > brighter(p.counter) ? p.stripe : shade(p.counter, 1.45);
    block(g, 4.8, 0.12, 1.4, GRAPHITE, 0, 0.06, Z);
    block(g, 5.0, 1.16, 1.6, INK.white, 0, 0.7, Z, { round: 0.14, fine: 2 });
    slab(g, p.counter, { map: null, roughness: 0.3, metalness: 0.25, round: 0.05 });
    block(g, 2.2, 0.6, 0.04, p.counter, -1.2, 0.72, 3.11, { round: 0.03 });           // the sign: a panel in the yard's colour
    block(g, 2.2, 0.1, 0.05, p.stripe, -1.2, 0.5, 3.115);
    // the glass case at the corner, with the product on its two shelves
    const x = -2.7, z = 3.46;
    block(g, 0.62, 0.3, 0.62, GRAPHITE, x, 0.15, z, { round: 0.03 });
    block(g, 0.56, 0.04, 0.56, INK.white, x, 1.22, z);
    block(g, 0.62, 0.1, 0.62, GRAPHITE, x, 2.17, z, { round: 0.03 });
    const glass = put(g, box(0.58, 1.84, 0.58, INK.glass, { ...GLASS, opacity: 0.22 }), x, 1.22, z); glass.castShadow = false;
    row(st, [x], 0.3, z, 0.46, 0.46, 0.8); row(st, [x], 1.24, z, 0.46, 0.46, 0.8);
    // the pylon at the other corner
    block(g, 0.5, 2.5, 0.16, GRAPHITE, 2.72, 1.25, 3.44, { round: 0.04 });
    block(g, 0.4, 0.9, 0.03, p.counter, 2.72, 1.65, 3.53, { round: 0.02 });
    bin(g, st, 0.07, 3.5, INK.white, { h: 0.7 });
    const strip = (w, h, d, at) => ({ geo: new THREE.BoxGeometry(w, h, d), at });
    glowing(g, [strip(4.7, 0.07, 0.03, [0, 0.22, 3.115]), strip(2.3, 0.05, 0.03, [1.25, 1.12, 3.115]), strip(0.4, 0.07, 0.03, [2.72, 2.3, 3.53]),
      strip(0.4, 0.07, 0.03, [2.72, 1.05, 3.53]), strip(0.5, 0.05, 0.5, [x, 2.245, z])], lightOf, lightOf, 0.75).castShadow = false;
    show(st, -2.12, TOP, Z);
    TILLS.terminal(till, INK.white, lightOf);
  },
};

/**
 * Build a shop into `g`.
 * @param body   one of SHOP_BODY in js/data/looks.js; one this file does not know is built as a trading post
 * @param paint  the yard's { counter, top, board, stripe }
 * @param item   what the shop sells: it is shown on the counter and around it
 * @returns {{ till }}  the till, in a group of its own on the counter: the station makes it jump on a sale
 */
export function buildShop(g, body, paint, item) {
  const st = { item, stock: [] }, till = pivot(g, TILL_AT.x, TILL_AT.y, TILL_AT.z);
  (BODIES[body] || BODIES.post)(g, paint, st, till);
  rig(till);
  if (st.stock.length) pile(g, item, st.stock);
  return { till };
}
