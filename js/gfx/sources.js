// Source models: what stands behind a pile of raw material and says where it comes from. A mine entrance for the
// quarry and the three mines, each in the rock of what is mined, and an oil derrick for the oil field.
//
// The layout, in the source's own space: the pile lies around the middle (about 2.6 wide and 2.2 deep, js/stations.js),
// the yard's back fence runs at z = -4, and the camera looks down from +z. A model stands behind the pile and beside
// it on the west, the side nobody comes from (workers and the player arrive from the yard, east and south). It stays
// inside what js/sim/dressing.js keeps clear for it: x ±4.2 and z -5..0 for a mine, x ±2.4 along the fence for the
// derrick, and about as high as the rock and the derrick that stood here before (3.4 and 4.8), because the next yard's
// ground lies behind.
//
// Everything is built from the parts kit (js/gfx/kit.js), so the station can join the still parts into a few meshes
// (js/engine/bake.js). Only the derrick's travelling block moves, and the station moves it: nothing here knows the
// rules of the game.
import * as THREE from 'three';
import { ITEMS } from '../data/areas.js';
import { INK, GEO, block, rod, part, pivot, rig, pipe, frame, hazard, chimney, glowing, lantern } from './kit.js';

// ------------------------------------------------------------------ the mines
const TIMBER = 0x94602f, PLANK = 0xb98a55, SLEEPER = 0x6b4a2f;
/**
 * The rock of each mine, by what is mined there (the source's item): its two shades, and what shows in its face.
 *   benches   squared ledges and a cut block: a quarry is sawn, not blasted
 *   veins     rusty seams of ore
 *   nuggets   gold that catches the light
 *   crystals  clusters that glow after dark
 */
export const MINES = {
  stone:   { rock: 0x979ca2, deep: 0x7d838a, show: 'benches' },
  ore:     { rock: 0x705a51, deep: 0x58463f, show: 'veins' },
  goldore: { rock: 0x94805c, deep: 0x7a6748, show: 'nuggets' },
  crystal: { rock: 0x655e80, deep: 0x4f4968, show: 'crystals' },
};
const GOLD = { metalness: 1, roughness: 0.32, envMapIntensity: 1 };
const PORTAL = -2.6;   // where the mouth and its rails stand along x: west of the pile
const _ray = new THREE.Raycaster(), _from = new THREE.Vector3(), _north = new THREE.Vector3(0, 0, -1);
/** Where the rock of `hill` faces the camera at (x, y), in the space of `g`: its z there. What is set into the face goes by it. */
function faceOf(g, hill, x, y) {
  g.updateMatrixWorld(true);
  _ray.set(g.localToWorld(_from.set(x, y, 0)), _north);
  const hit = _ray.intersectObjects(hill, true)[0];
  return hit ? g.worldToLocal(hit.point).z : -2.6;
}

/**
 * A mine entrance behind a pile: a hill of rock, a timber-framed mouth with a lantern, and a short rail with a loaded cart.
 * @param g     the source's group
 * @param item  what is mined (decides the rock and what the cart carries)
 */
export function buildMine(g, item) {
  const m = MINES[item] || MINES.stone, load = ITEMS[item]?.mesh?.color ?? m.rock;
  /** A boulder: a faceted rock turned and then stretched to (sx, sy, sz), its middle at (x, y, z). */
  const rock = (x, y, z, sx, sy, sz, turn = 0, tilt = 0, color = m.rock, o) => {
    const h = pivot(g, x, y, z); h.scale.set(sx, sy, sz);
    part(h, GEO.rock(), color, 0, 0, 0, o).rotation.set(tilt, turn, 0.2);
    return h;
  };
  // the hill: a big mass behind the pile, a shoulder over the mouth, and what has rolled down to its foot
  const hill = [
    rock(0.9, 0.85, -3.4, 2.55, 2.55, 1.1, 0.5),
    rock(1.5, 1.7, -3.6, 1.45, 1.45, 0.8, 1.4, 0.4, m.deep),
    rock(-2.4, 0.9, -3.65, 1.72, 2.15, 0.85, 1.9, 0.3, m.deep),
    rock(-0.75, 0.4, -3.45, 1.3, 1.6, 0.95, 2.6, 0.5),
    rock(3.15, 0.3, -3.1, 1.0, 1.05, 0.85, 1.1, 0.2, m.deep),
  ];
  rock(-3.9, 0.15, -2.45, 0.34, 0.3, 0.32, 0.7, 0, m.deep);
  rock(-1.2, 0.2, -2.6, 0.5, 0.42, 0.4, 2.2);
  rock(3.65, 0.14, -2.2, 0.36, 0.3, 0.34, 0.3);
  SHOWS[m.show](g, rock, (x, y) => faceOf(g, hill, x, y));

  // the mouth: a set of timbers standing out of the rock, dark inside
  const x0 = PORTAL;
  block(g, 1.5, 1.8, 0.95, 0x15120f, x0, 0.9, -2.98);
  for (const s of [-1, 1]) {
    block(g, 0.26, 1.92, 1.0, TIMBER, x0 + s * 0.88, 0.96, -2.9, { round: 0.03 });
    block(g, 0.12, 0.62, 0.14, TIMBER, x0 + s * 0.6, 1.7, -2.36).rotation.z = s * 0.78;   // a knee brace in each corner
  }
  block(g, 2.36, 0.28, 1.1, TIMBER, x0, 2.06, -2.9, { round: 0.03 });
  block(g, 1.9, 0.07, 0.9, SLEEPER, x0, 2.235, -2.95);                               // boards over the cap
  block(g, 0.9, 0.2, 0.05, PLANK, x0, 2.06, -2.33);                                  // the name board
  block(g, 0.07, 0.07, 0.34, INK.dark, x0 + 1.08, 1.94, -2.2);                       // a bracket for the lantern
  lantern(g, x0 + 1.08, 1.72, -2.1, { s: 0.9 });
  // the rails out of the mouth, a buffer at their end, and a cart of what is mined
  for (const s of [-1, 1]) block(g, 0.07, 0.09, 2.65, INK.iron, x0 + s * 0.3, 0.115, -1.78);
  for (let i = 0; i < 6; i++) block(g, 1.0, 0.07, 0.16, SLEEPER, x0, 0.035, -2.85 + i * 0.46);
  block(g, 1.0, 0.36, 0.14, TIMBER, x0, 0.34, -0.42);
  for (const s of [-1, 1]) block(g, 0.14, 0.56, 0.14, SLEEPER, x0 + s * 0.4, 0.28, -0.3);
  const cz = -1.55;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(g, 0.17, 0.07, INK.dark, x0 + sx * 0.3, 0.33, cz + sz * 0.32, 'x', undefined, 10);
  block(g, 0.72, 0.1, 1.0, INK.dark, x0, 0.4, cz);
  block(g, 0.86, 0.5, 1.1, 0x5a626d, x0, 0.7, cz, { round: 0.06 });
  block(g, 0.94, 0.08, 1.18, INK.iron, x0, 0.95, cz, { round: 0.03 });
  for (const [dx, dz, k, turn] of [[-0.14, -0.28, 0.3, 0.4], [0.16, -0.08, 0.32, 1.7], [-0.1, 0.22, 0.29, 2.9], [0.14, 0.36, 0.22, 0.9], [0.02, 0.05, 0.26, 2.1]]) {
    rock(x0 + dx, 1.0 + k * 0.2, cz + dz, k, k * 0.8, k, turn, 0.4, load);
  }
}

/** Where things show in the face of the hill: (x, y) over its front, low and high. */
const SPOTS = [[0.25, 1.35], [1.55, 0.8], [1.05, 2.15], [2.35, 1.45], [-0.5, 0.7], [0.85, 1.8], [2.95, 0.55]];
/** What shows in the face of each kind of rock. `rock` makes a boulder of the mine, `face(x, y)` says where the hill's face is. */
const SHOWS = {
  benches(g, rock, face) {
    const CUT = 0xc3c7cb, CUT2 = 0xaeb3b8;
    block(g, 1.7, 0.5, 0.7, CUT2, 1.75, 0.25, -2.5, { round: 0.03 });
    block(g, 1.15, 0.46, 0.6, CUT, 2.05, 0.73, -2.62, { round: 0.03 });
    for (const [x, y, w] of [[0.3, 1.5, 0.8], [1.3, 2.3, 1.2], [2.5, 1.6, 0.7]]) block(g, w, 0.46, 0.6, y > 2 ? CUT2 : CUT, x, y, face(x, y) - 0.12, { round: 0.03 });
    block(g, 0.55, 0.42, 0.48, CUT, 3.4, 0.21, -2.2, { round: 0.03 }).rotation.y = 0.5;
  },
  veins(g, rock, face) {
    const RUST = 0xa5532f, DARK = 0x3d3230;
    SPOTS.forEach(([x, y], i) => rock(x, y, face(x, y) - 0.02, i % 3 ? 0.55 : 0.8, 0.17, 0.16, i * 1.3, 0, i % 3 === 2 ? DARK : RUST));
  },
  nuggets(g, rock, face) {
    SPOTS.forEach(([x, y], i) => { const k = 0.17 + (i % 3) * 0.045; rock(x, y, face(x, y) + 0.02, k, k * 0.8, k, i * 2.1, i, 0xffd23f, GOLD); });
  },
  crystals(g, rock, face) {
    const A = 0xa98bff, B = 0x6fe3ff, geo = GEO.cone(0.25, 1.2, 6), parts = [];
    SPOTS.forEach(([x, y], i) => {
      const k = 1 - (i % 3) * 0.14, z = face(x, y);
      parts.push({ geo, color: A, at: [x, y + 0.2 * k, z + 0.12], turn: [0.8, 0, 0.1], scale: k });
      parts.push({ geo, color: B, at: [x - 0.24 * k, y + 0.05 * k, z + 0.1], turn: [0.95, 0, 0.55], scale: k * 0.72 });
      parts.push({ geo, color: A, at: [x + 0.24 * k, y, z + 0.1], turn: [1.05, 0, -0.6], scale: k * 0.6 });
    });
    glowing(g, parts, 0xffffff, 0x8a6dff, 0.45).castShadow = false;
  },
};

// ------------------------------------------------------------------ the oil derrick
const RIG = 0x4a4f57, DECK = 0x6a707a, RED = 0xe0452f;

/**
 * An oil derrick behind the barrels: a lattice tower on a drill floor, its travelling block on the line from the
 * crown, an engine with its winch on one side and a mud tank and the well's valves on the other.
 * @returns {{ pump }}  the travelling block with the kelly under it: the station moves it up and down
 */
export function buildDerrick(g) {
  const d = pivot(g, 0, 0, -2.95), F = 0.62, H = 4.25;   // F: the height of the drill floor, H: of the crown
  // the substructure and the drill floor
  frame(d, 1.8, F - 0.08, 1.8, INK.iron, 0, 0, 0, { post: 0.12 });
  block(d, 1.9, 0.08, 1.9, DECK, 0, F - 0.04, 0);
  hazard(d, 1.9, 0, F - 0.05, 0.96, 0.12, 10);
  rod(d, 0.3, 0.1, RED, 0, F + 0.05, 0, 'y', undefined, 12);   // the rotary table
  // four legs lean in to the crown, with girts and braces between them
  const at = (sx, sz, y) => { const r = 0.8 - 0.56 * (y - F) / (H - F); return [sx * r, y, sz * r]; };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], levels = [F, 1.6, 2.55, 3.45, H];
  for (const [sx, sz] of corners) pipe(d, [at(sx, sz, F), at(sx, sz, H)], 0.07, RIG);
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    for (let l = 1; l < levels.length; l++) {
      pipe(d, [at(...a, levels[l]), at(...b, levels[l])], 0.045, RIG);
      const up = (l + i) % 2;
      pipe(d, [at(...(up ? a : b), levels[l - 1]), at(...(up ? b : a), levels[l])], 0.03, RIG);
    }
  }
  block(d, 0.7, 0.26, 0.7, RED, 0, H + 0.13, 0, { round: 0.04 });               // the crown block
  rod(d, 0.18, 0.12, INK.dark, 0, H + 0.34, 0, 'x', undefined, 12);              // its sheave
  block(d, 0.8, 0.05, 0.36, DECK, 0, 3.1, 0.56);                                // the monkey board
  for (const s of [-1, 1]) block(d, 0.04, 0.3, 0.04, INK.hazard, s * 0.38, 3.26, 0.72);
  block(d, 0.8, 0.04, 0.04, INK.hazard, 0, 3.4, 0.72);
  for (let i = 0; i < 5; i++) rod(d, 0.03, 2.5, INK.steel, 0.14 + (i % 3) * 0.09, F + 1.25, -0.3 - (i > 2 ? 0.09 : 0), 'y', undefined, 6);   // drill pipe racked in the tower
  for (const s of [-1, 1]) rod(d, 0.016, H - 2.15, INK.dark, s * 0.07, (H + 2.15) / 2, 0, 'y', undefined, 5);                                // the line down from the crown
  // the travelling block, its hook, the swivel and the kelly that goes down through the floor
  const pump = pivot(d, 0, 1.4, 0);
  block(pump, 0.34, 0.44, 0.26, INK.hazard, 0, 1.22, 0, { round: 0.05 });
  block(pump, 0.08, 0.2, 0.08, INK.dark, 0, 0.92, 0);
  block(pump, 0.2, 0.18, 0.2, RED, 0, 0.74, 0, { round: 0.03 });
  block(pump, 0.09, 2.2, 0.09, INK.steel, 0, -0.42, 0);
  rig(pump);
  // west: the engine and the winch that hauls the line
  block(d, 1.0, 0.1, 1.3, INK.iron, -1.72, 0.05, 0.05);
  block(d, 0.9, 0.7, 1.15, RED, -1.72, 0.45, 0.05, { round: 0.06 });
  block(d, 1.0, 0.08, 1.25, INK.dark, -1.72, 0.84, 0.05);
  chimney(d, 0.07, 1.0, INK.iron, -1.95, 0.88, -0.3);
  rod(d, 0.2, 0.6, INK.dark, -0.72, F + 0.24, 0, 'z', undefined, 12);
  for (const s of [-1, 1]) rod(d, 0.27, 0.05, RED, -0.72, F + 0.24, s * 0.32, 'z', undefined, 12);
  pipe(d, [[-0.72, F + 0.42, 0], [-0.06, H + 0.4, 0]], 0.014, INK.dark);
  // east: the mud tank with its pipe up the tower, and the well's valves
  block(d, 0.85, 0.56, 1.2, DECK, 1.72, 0.3, -0.25, { round: 0.05 });
  block(d, 0.4, 0.06, 0.4, INK.dark, 1.72, 0.61, -0.4);
  pipe(d, [[1.72, 0.58, 0.1], [1.72, 1.05, 0.1], [0.82, 1.05, 0.1], [at(1, 1, 2.55)[0] + 0.05, 2.55, 0.1]], 0.045, RED);
  pipe(d, [[0.5, 0.26, 0.6], [1.75, 0.26, 0.6], [1.75, 0.26, 0.95], [1.75, 0.95, 0.95]], 0.065, INK.iron);
  rod(d, 0.05, 0.56, INK.iron, 1.75, 0.66, 0.95, 'x', undefined, 8);
  for (const [x, y] of [[1.47, 0.66], [2.03, 0.66], [1.75, 0.98]]) rod(d, 0.13, 0.04, RED, x, y, 0.98, y > 0.9 ? 'y' : 'z', undefined, 10);
  return { pump };
}
