// The edge of the map around Industrial City and the Metropolis, as a miniature city: a street along the yards'
// fences with lane lines, crossings, kerbs and parking bays; behind it factories, warehouses and two striped chimneys
// beside the city, offices, shops and flats around the Metropolis; and on the pavement lamps, trees, benches and
// parked cars. The camera looks down from the south, so the roofs carry the detail.
//
// js/sim/site.js (cityEdge) decides what stands where, as plain numbers; this file knows what each thing looks like.
// Everything is built from blocks of one shared surface and joined with bake(), a stretch of street at a time, into
// two meshes: the still things with the paint on the road, and whatever shines after dark (windows, skylights, signs,
// lamps). The ground under them is three more: the asphalt, and the pavement of each location. Nothing here moves.
import * as THREE from 'three';
import { box, mat, soaks, GLOW, LIGHT, CITY_STACKS } from '../world.js';
import { bake } from '../engine/bake.js';
import { cylinderShape } from '../engine/materials.js';
import { ground, glowMap } from '../textures.js';
import { cityEdge, PARAPET } from '../sim/site.js';

// ------------------------------------------------------------------------------------------ shapes, made once
const share = geo => { geo.userData.shared = true; return geo; };
/** A shape whose every corner takes the middle of the block picture, where it is not shaded toward an edge. */
const plain = geo => { geo.attributes.uv.array.fill(0.5); return share(geo); };
const FLAT = share(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));   // lies on the ground and faces up
const PANE = share(new THREE.PlaneGeometry(1, 1));                          // stands and faces south
const DISC = share(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2));
const TUBE = { 8: share(new THREE.CylinderGeometry(1, 1, 1, 8)), 12: share(new THREE.CylinderGeometry(1, 1, 1, 12)) };
const CONE = share(new THREE.CylinderGeometry(0.07, 1, 1, 8));              // a parasol, a lid, a traffic cone
const DOME = share(new THREE.CylinderGeometry(0.4, 1, 1, 8));              // the top of a tank
const BALL = plain(new THREE.IcosahedronGeometry(1, 0));
const corners = pts => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pts.length / 3 * 2).fill(0.5), 2)); g.computeVertexNormals(); return share(g); };
const GABLE = corners([   // a roof one long, one deep and one high: its ridge runs along x, its foot lies at y = 0
  -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
  0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
  -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
]);
const TOOTH = corners([   // one tooth of a saw-tooth roof: upright toward the south, sloping down to the north
  -0.5, 0, -0.5, -0.5, 1, 0.5, 0.5, 1, 0.5, -0.5, 0, -0.5, 0.5, 1, 0.5, 0.5, 0, -0.5,      // the slope
  -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,          // the upright face
  -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0.5,        // the two ends
]);

// ------------------------------------------------------------------------------------------ colours
const C = {
  graphite: 0x3c434c, iron: 0x2f343b, steel: 0x9aa3ad, silver: 0xc9cfd5, white: 0xf2f1ec, concrete: 0xbdbab2, wood: 0xa8743f, trunk: 0x6b4226, soil: 0x4a3a2c,
  teal: 0x2f8f83, glass: 0x7fc4e8, pane: 0x2b3a4a, yellow: 0xf2c230, black: 0x23262b, red: 0xd4483b, orange: 0xe8742c, tyre: 0x1d1f23, lawn: 0x6fa84f, gold: 0xe3b341,
  water: 0x4fc3e8, panel: 0x27408b, kerb: 0xc4c2bb, cover: 0x33373d, deck: 0x565b63,
  warm: 0xffe2a0, cool: 0xd6ecf7, sky: 0xa9dcf5, lamp: 0xfff1c2, sodium: 0xffc58a, beacon: 0xff5a4a,
};
const LEAVES = [0x4f9a3f, 0x5aa845, 0x6dbb4e];
const CARS = [0xe23d3d, 0x3d7be2, 0xf0f0f0, 0x2f9e6b, 0xf2c230, 0x3c434c, 0xe8742c];
const CRATES = [0xb5432e, 0x2f6fb0, 0x3f8f5f, 0xe8742c, 0x8a9099];          // shipping containers, drums, lorry cabs
const ACCENT = [0xd4483b, 0x2f8f83, 0xf2a900, 0x3d7be2, 0xd94f8a];          // awnings, parasols and signs: by a building's tint
const NEON = [0xff5fa2, 0x4fe3ff, 0xffd84a, 0x6dff9a, 0xff8a4a];
/** What the two locations are built of. Seen from above, the roofs are what the player sees. */
const LOOKS = {
  city: { walls: [0xa8553f, 0xc98a4b, 0x7f8a94, 0x9aa3ad, 0x8a6f5a], roofs: [0x5e7f9a, 0x8a4f3a, 0xd0a146, 0x4f7f6a, 0xb5533c], trim: 0xd9d4c7, foot: 0x4a4f57, paving: ['concrete', 5, 0xa3a6a8] },
  metropolis: { walls: [0xf2f1ec, 0xe8dcc0, 0xd98e73, 0xa9bccf, 0xc9b79c], roofs: [0x59606a, 0x8a9099, 0xb9b4a8, 0x6f7d8c, 0x9c4a36], trim: 0xf2f1ec, foot: 0x6b7078, paving: ['flags', 3, 0xc6c1b6], glass: [0x6fb7dc, 0x69c2b8, 0x5d8fc9, 0x8fc9e8, 0x4f9fb8] },
};

const _shade = new THREE.Color();
/** A colour, darker (k < 1) or lighter. */
const shade = (hex, k) => _shade.set(hex).multiplyScalar(k).getHex();

// ------------------------------------------------------------------------------------------ drawing a thing
let STILL = null, LIT = null;   // where the parts of the thing being drawn go: the still ones, and the ones that shine after dark
let QUIET = false;              // true while small things are drawn: they throw no shadow, and are joined into a mesh the shadow pass skips
/** Draw small things: whatever `draw` adds throws no shadow. */
const quiet = draw => { const was = QUIET; QUIET = true; draw(); QUIET = was; };

/** One part: a shape in a colour, scaled, turned and put at (x, y, z). o: rx, ry, rz turn it; glow: it shines after dark. */
function part(geo, color, sx, sy, sz, x, y, z, o) {
  const m = box(1, 1, 1, color);   // a block of the one shared surface in that colour; other shapes take its place
  if (geo) m.geometry = geo;
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  if (o) { m.rotation.order = 'YXZ'; m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); }
  if (QUIET || geo === FLAT || geo === DISC || geo === PANE) m.castShadow = false;   // paint, panes and small things throw no shadow
  if (o && o.glow) { m.castShadow = false; LIT.add(m); } else STILL.add(m);
  return m;
}
/** A block w by h by d with its middle at (x, y, z). */
const blk = (w, h, d, c, x, y, z, o) => part(null, c, w, h, d, x, y, z, o);
/** An upright cylinder of radius r, h high. o.seg: 8 or 12 sides. */
const tube = (r, h, c, x, y, z, o) => part(TUBE[o?.seg || 8], c, r, h, r, x, y, z, o);
const cone = (r, h, c, x, y, z, o) => part(CONE, c, r, h, r, x, y, z, o);
const dome = (r, h, c, x, y, z, o) => part(DOME, c, r, h, r, x, y, z, o);
const ball = (r, c, x, y, z, o) => part(BALL, c, r, r * (o?.sy || 1), r, x, y, z, o);
/** Paint or a pane lying flat, w by d. */
const flat = (w, d, c, x, y, z, o) => part(FLAT, c, w, 1, d, x, y, z, o);
const disc = (r, c, x, y, z, o) => part(DISC, c, r, 1, r, x, y, z, o);
/** A pane standing upright, w by h: it faces south, or the way `ry` turns it. */
const pane = (w, h, c, x, y, z, ry = 0, glow = false) => part(PANE, c, w, h, 1, x, y, z, { ry, glow });

/** Draw something in a place of its own: at (x, y, z), turned by ry (and tilted by rx). Everything `draw` adds is measured from there. */
function placed(x, y, z, ry, draw, rx = 0) {
  const still = STILL, lit = LIT;
  const frame = () => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.order = 'YXZ'; g.rotation.set(rx, ry, 0); return g; };
  STILL = frame(); LIT = frame(); still.add(STILL); lit.add(LIT);
  draw();
  STILL = still; LIT = lit;
}

// ------------------------------------------------------------------------------------------ what stands along the street
// Each is drawn around its own middle on the ground: x along the street, its front toward -z, where the road is.
// The sizes are listed in EDGE_THINGS (js/sim/site.js), which keeps them apart and under the camera's line of sight.
const THINGS = {
  lamp() {
    blk(0.24, 0.2, 0.24, C.graphite, 0, 0.1, 0); blk(0.09, 3, 0.09, C.graphite, 0, 1.6, 0);
    blk(0.07, 0.07, 0.8, C.graphite, 0, 3.08, -0.36); blk(0.26, 0.1, 0.42, C.graphite, 0, 3.04, -0.72);
    blk(0.18, 0.04, 0.32, C.lamp, 0, 2.97, -0.72, { glow: true }); flat(0.16, 0.3, C.lamp, 0, 3.095, -0.72, { glow: true });   // the light, and a glass top that shows it from above
  },
  flood() {   // a floodlight mast, as a works has them
    blk(0.34, 0.16, 0.34, C.yellow, 0, 0.08, 0); blk(0.3, 0.1, 0.3, C.black, 0, 0.21, 0);
    blk(0.12, 3.8, 0.12, C.steel, 0, 2.1, 0); blk(0.9, 0.08, 0.08, C.steel, 0, 3.95, 0);
    for (const x of [-0.3, 0.3]) { blk(0.34, 0.22, 0.16, C.iron, x, 3.86, -0.12, { rx: 0.5 }); blk(0.28, 0.16, 0.03, C.sodium, x, 3.82, -0.2, { rx: 0.5, glow: true }); }
  },
  tree(tint) {   // a street tree in its planter
    blk(0.85, 0.42, 0.85, C.white, 0, 0.21, 0); flat(0.7, 0.7, C.soil, 0, 0.425, 0);
    blk(0.14, 1.15, 0.14, C.trunk, 0, 1, 0);
    ball(0.78, LEAVES[tint % 3], 0, 2, 0, { sy: 0.82 }); ball(0.48, LEAVES[(tint + 1) % 3], 0.32, 2.25, 0.18);
  },
  bench() {
    blk(1.3, 0.07, 0.42, C.wood, 0, 0.42, 0); blk(1.3, 0.3, 0.06, C.wood, 0, 0.6, 0.2);
    for (const x of [-0.5, 0.5]) blk(0.07, 0.4, 0.4, C.graphite, x, 0.2, 0);
  },
  bin() { blk(0.34, 0.6, 0.34, C.graphite, 0, 0.3, 0); blk(0.38, 0.07, 0.38, C.teal, 0, 0.64, 0); },
  bollard(tint) {   // a works bollard in yellow and black, or a slim one with a band of light
    if (tint) { blk(0.16, 0.62, 0.16, C.yellow, 0, 0.31, 0); blk(0.17, 0.12, 0.17, C.black, 0, 0.42, 0); }
    else { blk(0.15, 0.6, 0.15, C.graphite, 0, 0.3, 0); blk(0.16, 0.07, 0.16, 0x9fe8ff, 0, 0.5, 0, { glow: true }); }
  },
  hydrant() {
    blk(0.2, 0.48, 0.2, C.red, 0, 0.24, 0); blk(0.26, 0.08, 0.26, C.red, 0, 0.52, 0);
    blk(0.34, 0.1, 0.1, C.red, 0, 0.34, 0); blk(0.12, 0.06, 0.12, C.white, 0, 0.59, 0);
  },
  planter(tint) {   // a box of flowers
    blk(1.4, 0.42, 0.5, C.white, 0, 0.21, 0); flat(1.26, 0.36, C.soil, 0, 0.425, 0);
    ball(0.21, LEAVES[1], -0.42, 0.52, 0); ball(0.19, ACCENT[tint % 5], 0, 0.55, 0.02); ball(0.21, ACCENT[(tint + 2) % 5], 0.42, 0.52, 0);
  },
  cafe(tint) {   // a table under a parasol
    blk(0.05, 1.5, 0.05, C.steel, 0, 0.75, 0); tube(0.34, 0.05, C.white, 0, 0.62, 0);
    cone(0.64, 0.3, ACCENT[tint % 5], 0, 1.5, 0);
    for (const x of [-0.45, 0.45]) blk(0.22, 0.36, 0.22, C.wood, x, 0.18, 0.05);
  },
  kiosk(tint) {   // a news stand
    blk(1.4, 1.6, 1.05, C.teal, 0, 0.8, 0.05); blk(1.5, 0.1, 1.2, C.white, 0, 1.68, 0);
    pane(1, 0.6, C.pane, 0, 1.1, -0.48, Math.PI); blk(1.4, 0.05, 0.36, ACCENT[tint % 5], 0, 1.52, -0.42, { rx: -0.35 });
    for (const [x, c] of [[-0.3, C.white], [0, C.yellow], [0.3, C.red]]) blk(0.22, 0.12, 0.2, c, x, 0.78, -0.5);
    blk(0.6, 0.2, 0.06, C.warm, 0, 1.85, -0.3, { glow: true });
  },
  shelter() {   // a bus stop: a glass back, a roof, a bench and a sign
    for (const x of [-1.05, 1.05]) blk(0.07, 1.6, 0.07, C.graphite, x, 0.8, 0.38);
    blk(2.1, 1.1, 0.04, C.glass, 0, 0.95, 0.4); blk(2.3, 0.07, 0.95, C.teal, 0, 1.64, 0); flat(2, 0.62, 0xb7e3f5, 0, 1.68, -0.02);
    blk(1.5, 0.07, 0.3, C.wood, 0, 0.45, 0.2); blk(1.8, 0.03, 0.1, C.lamp, 0, 1.59, 0, { glow: true });
    blk(0.06, 1.7, 0.06, C.graphite, 1, 0.85, -0.38); blk(0.3, 0.3, 0.04, 0x3d7be2, 1, 1.5, -0.42);
  },
  mailbox(tint) {
    const c = tint % 2 ? 0x3d7be2 : C.red;
    blk(0.1, 0.2, 0.1, C.graphite, 0, 0.1, 0); blk(0.34, 0.66, 0.3, c, 0, 0.53, 0); blk(0.36, 0.07, 0.32, c, 0, 0.9, 0);
    pane(0.22, 0.05, C.black, 0, 0.7, -0.155, Math.PI);
  },
  car(tint) {
    const c = CARS[tint % CARS.length];
    for (const z of [-0.6, 0.6]) blk(1, 0.3, 0.36, C.tyre, 0, 0.15, z);   // an axle's two wheels as one block: only their ends show
    blk(0.92, 0.34, 1.9, c, 0, 0.36, 0); blk(0.8, 0.26, 1, C.pane, 0, 0.66, 0.08); blk(0.78, 0.04, 0.92, c, 0, 0.8, 0.08);
    for (const x of [-0.3, 0.3]) { pane(0.2, 0.08, C.white, x, 0.4, -0.955, Math.PI); pane(0.2, 0.07, C.red, x, 0.42, 0.955); }
    if (tint % CARS.length === 4) flat(0.3, 0.5, C.black, 0, 0.825, 0.08);   // the yellow one is a taxi: a dark mark on its roof
  },
  truck(tint) {   // a lorry: a cab in colour and a white box
    const c = CRATES[tint % 4];
    for (const z of [-1, 0.9]) blk(1.24, 0.4, 0.44, C.tyre, 0, 0.2, z);
    blk(1, 0.14, 3, C.iron, 0, 0.42, 0); blk(1.15, 0.8, 0.85, c, 0, 0.9, -1.1); pane(0.95, 0.34, C.pane, 0, 1.05, -1.53, Math.PI);
    blk(1.2, 1.1, 1.95, C.white, 0, 1.05, 0.5); blk(1.22, 0.2, 1.6, c, 0, 0.9, 0.5);
  },
  containers(tint) {
    blk(2.4, 1, 1, CRATES[tint % 5], 0, 0.5, 0); blk(2.4, 1, 1, CRATES[(tint + 2) % 5], 0, 1.52, 0);
    for (const y of [0.5, 1.52]) { pane(0.9, 0.86, C.iron, 1.201, y, 0, Math.PI / 2); blk(0.04, 0.8, 0.04, C.silver, 1.21, y, 0); }
  },
  tanks(tint) {   // two storage tanks on a pad, a pipe between them
    blk(3.2, 0.1, 1.7, C.concrete, 0, 0.05, 0);
    for (const x of [-0.8, 0.8]) {
      tube(0.72, 2.1, C.white, x, 1.15, 0); tube(0.735, 0.28, ACCENT[tint % 5], x, 1.5, 0); dome(0.72, 0.3, C.silver, x, 2.35, 0);
      blk(0.12, 2.1, 0.05, C.yellow, x, 1.15, -0.74);
    }
    blk(0.9, 0.1, 0.1, C.orange, 0, 0.5, -0.4);
  },
  drums(tint) {
    blk(0.9, 0.1, 0.9, C.wood, 0, 0.05, 0);
    for (const [k, x, z] of [[0, -0.22, -0.2], [1, 0.22, -0.2], [2, 0, 0.22]]) { tube(0.2, 0.55, CRATES[(tint + k) % 4], x, 0.375, z); disc(0.15, C.iron, x, 0.655, z); }
  },
  barrier() {   // the end of a street: a red and white boom on two posts
    for (const x of [-1, 1]) { blk(0.12, 0.84, 0.3, C.white, x, 0.42, 0); blk(0.1, 0.1, 0.1, C.sodium, x, 0.89, 0, { glow: true }); }
    for (let i = 0; i < 5; i++) blk(0.48, 0.16, 0.07, i % 2 ? C.white : C.red, -0.96 + i * 0.48, 0.74, 0);
    blk(2.3, 0.08, 0.05, C.white, 0, 0.42, 0);
  },
  cone() { blk(0.24, 0.03, 0.24, C.orange, 0, 0.015, 0); blk(0.13, 0.2, 0.13, C.orange, 0, 0.13, 0); blk(0.1, 0.07, 0.1, C.white, 0, 0.265, 0); blk(0.07, 0.12, 0.07, C.orange, 0, 0.36, 0); },
  hut() {   // a gatehouse
    blk(1.24, 1.6, 1.24, C.white, 0, 0.8, 0); blk(1.26, 0.3, 1.26, 0x2f6fb0, 0, 0.35, 0); blk(1.4, 0.12, 1.4, C.graphite, 0, 1.66, 0);
    pane(0.8, 0.5, C.warm, 0, 1.15, -0.635, Math.PI, true); pane(0.8, 0.5, C.pane, 0.635, 1.15, 0, Math.PI / 2);
  },
  plinth() { blk(2.2, 0.3, 2.2, C.concrete, 0, 0.15, 0); blk(1.9, 0.2, 1.9, 0xa7a39a, 0, 0.4, 0); },
};

/** The small things, which throw no shadow. */
const SMALL = new Set(['bin', 'bollard', 'hydrant', 'planter', 'mailbox', 'cone', 'plinth']);

// ------------------------------------------------------------------------------------------ what stands on a roof
// Each is given the room it may fill: k = { x, z, w, d, y } in the world, y being the roof it stands on.
/** `n` places in a row along the longer side of the room, each `step` apart at most: fn(x, z, along x?). */
function inRow(k, step, fn) {
  const alongX = k.w >= k.d, len = alongX ? k.w : k.d, n = Math.max(1, Math.floor(len / step));
  for (let i = 0; i < n; i++) { const off = (i - (n - 1) / 2) * (len / n); fn(alongX ? k.x + off : k.x, alongX ? k.z : k.z + off, alongX); }
}
const ROOF = {
  ac(k) { inRow(k, 1.15, (x, z, ax) => { blk(ax ? 0.82 : 0.6, 0.42, ax ? 0.6 : 0.82, 0xdfe3e6, x, k.y + 0.23, z); disc(0.2, C.iron, x, k.y + 0.445, z); }); },
  skylight(k) { inRow(k, 1.2, (x, z, ax) => { blk(ax ? 0.95 : 0.6, 0.2, ax ? 0.6 : 0.95, C.graphite, x, k.y + 0.1, z); flat(ax ? 0.82 : 0.47, ax ? 0.47 : 0.82, C.sky, x, k.y + 0.205, z, { glow: true }); }); },
  solar(k) { inRow(k, k.w >= k.d ? 1.05 : 0.9, (x, z) => { blk(0.95, 0.05, 0.7, C.panel, x, k.y + 0.3, z, { rx: 0.38 }); blk(0.8, 0.26, 0.06, C.steel, x, k.y + 0.13, z - 0.25); }); },
  stair(k, o) {   // the head of the stairs
    const w = Math.min(k.w, 1.1), d = Math.min(k.d, 1.1);
    blk(w, 0.85, d, LOOKS[o.where].trim, k.x, k.y + 0.425, k.z); blk(w + 0.12, 0.07, d + 0.12, C.graphite, k.x, k.y + 0.885, k.z);
    pane(0.5, 0.65, C.pane, k.x, k.y + 0.35, k.z + d / 2 + 0.01);
  },
  antenna(k) {
    blk(0.07, 1.9, 0.07, C.steel, k.x, k.y + 0.95, k.z); blk(0.5, 0.04, 0.04, C.steel, k.x, k.y + 1.5, k.z); blk(0.36, 0.04, 0.04, C.steel, k.x, k.y + 1.2, k.z);
    blk(0.1, 0.1, 0.1, C.beacon, k.x, k.y + 1.93, k.z, { glow: true });
  },
  helipad(k) {
    const r = Math.min(k.w, k.d) / 2 - 0.05;
    disc(r, C.yellow, k.x, k.y + 0.045, k.z); disc(r * 0.88, 0x4a5058, k.x, k.y + 0.05, k.z);
    for (const s of [-1, 1]) flat(0.14 * r, 0.72 * r, C.white, k.x + s * 0.22 * r, k.y + 0.056, k.z);
    flat(0.44 * r, 0.14 * r, C.white, k.x, k.y + 0.056, k.z);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) blk(0.1, 0.06, 0.1, NEON[3], k.x + sx * r * 0.74, k.y + 0.06, k.z + sz * r * 0.74, { glow: true });
  },
  sign(k, o) {   // a shop's sign on the edge of its roof, leaning back so that it is read from above: lit blocks on a dark board
    const len = Math.max(k.w, k.d), ry = k.face === 'n' ? 0 : k.face === 'e' ? -Math.PI / 2 : Math.PI / 2, n = Math.max(2, Math.floor(len / 0.6));
    placed(k.x, k.y, k.z, ry, () => { for (const x of [-len * 0.35, len * 0.35]) blk(0.08, 0.3, 0.08, C.iron, x, 0.15, 0.1); });
    placed(k.x, k.y + 0.42, k.z, ry, () => {
      blk(len, 0.62, 0.07, C.graphite, 0, 0, 0);
      for (let i = 0; i < n; i++) pane(0.36, 0.36, NEON[(o.tint + (i === n - 1 ? 1 : 0)) % 5], (i - (n - 1) / 2) * (len / n), 0, -0.04, Math.PI, true);
    }, 0.6);
  },
  billboard(k, o) {   // a board on two legs, leaning back toward whoever looks down on it: a sun, two lines of writing and a band
    const len = Math.max(k.w, k.d), ry = k.face === 's' ? 0 : k.face === 'e' ? Math.PI / 2 : -Math.PI / 2;
    placed(k.x, k.y, k.z, ry, () => { for (const x of [-len * 0.35, len * 0.35]) blk(0.1, 1, 0.1, C.iron, x, 0.5, -0.1); });
    placed(k.x, k.y + 1.35, k.z, ry, () => {
      blk(len, 1.5, 0.1, C.graphite, 0, 0, 0);
      pane(len - 0.16, 1.34, [0x2f6fb0, 0xf2f1ec, 0x2f8f83][o.tint % 3], 0, 0, 0.06, 0, true);
      pane(0.7, 0.7, NEON[2], -len * 0.26, 0.1, 0.07, 0, true);
      pane(len * 0.4, 0.16, o.tint % 3 === 1 ? C.red : C.white, len * 0.18, 0.28, 0.07, 0, true); pane(len * 0.3, 0.16, o.tint % 3 === 1 ? C.graphite : C.white, len * 0.13, 0, 0.07, 0, true);
      pane(len - 0.16, 0.22, ACCENT[o.tint % 5], 0, -0.56, 0.07, 0, true);
    }, -0.45);
  },
  vent(k) { tube(0.24, 0.3, C.steel, k.x, k.y + 0.15, k.z); ball(0.3, C.silver, k.x, k.y + 0.42, k.z, { sy: 0.6 }); },
  garden(k, o) {   // a roof garden: a lawn, bushes, a parasol and two sun beds
    blk(k.w, 0.12, k.d, C.lawn, k.x, k.y + 0.06, k.z);
    ball(0.42, LEAVES[0], k.x - k.w * 0.3, k.y + 0.4, k.z - k.d * 0.2); ball(0.34, LEAVES[2], k.x + k.w * 0.32, k.y + 0.36, k.z + k.d * 0.25); ball(0.3, LEAVES[1], k.x - k.w * 0.1, k.y + 0.33, k.z + k.d * 0.3);
    const px = k.x + k.w * 0.15, pz = k.z - k.d * 0.15;
    blk(0.05, 1.3, 0.05, C.steel, px, k.y + 0.65, pz); cone(0.6, 0.26, ACCENT[o.tint % 5], px, k.y + 1.3, pz);
    if (k.w > 2.4) for (const s of [-1, 1]) blk(0.3, 0.12, 0.8, C.white, px + s * 0.5, k.y + 0.2, pz + 0.15);
  },
  pool(k, o) {   // a pool on the roof, lit from below after dark
    blk(k.w, 0.18, k.d, C.white, k.x, k.y + 0.09, k.z); flat(k.w - 0.4, k.d - 0.4, C.water, k.x, k.y + 0.185, k.z, { glow: true });
    const px = k.x - k.w / 2 + 0.25, pz = k.z + k.d / 2 - 0.25;
    blk(0.05, 1.3, 0.05, C.steel, px, k.y + 0.65, pz); cone(0.55, 0.26, ACCENT[o.tint % 5], px, k.y + 1.3, pz);
    blk(0.06, 0.3, 0.3, C.steel, k.x + k.w / 2 - 0.2, k.y + 0.3, k.z);
  },
  tank(k) {   // a water tank of wood on a steel frame
    blk(0.8, 0.5, 0.12, C.iron, k.x, k.y + 0.25, k.z); blk(0.12, 0.5, 0.8, C.iron, k.x, k.y + 0.25, k.z);
    tube(0.5, 0.9, C.wood, k.x, k.y + 0.95, k.z); cone(0.58, 0.3, C.graphite, k.x, k.y + 1.55, k.z);
  },
  tankH(k) {   // a tank lying on two saddles
    const ax = k.w >= k.d, len = (ax ? k.w : k.d) - 0.3;
    part(TUBE[8], C.white, 0.38, len, 0.38, k.x, k.y + 0.5, k.z, ax ? { rz: Math.PI / 2 } : { rx: Math.PI / 2 });
    for (const s of [-1, 1]) blk(ax ? 0.12 : 0.7, 0.3, ax ? 0.7 : 0.12, C.iron, k.x + (ax ? s * len * 0.3 : 0), k.y + 0.15, k.z + (ax ? 0 : s * len * 0.3));
    part(TUBE[8], C.orange, 0.39, 0.16, 0.39, k.x, k.y + 0.5, k.z, ax ? { rz: Math.PI / 2 } : { rx: Math.PI / 2 });
  },
  pipes(k) {   // three pipes side by side on low trestles
    const ax = k.w >= k.d, len = ax ? k.w : k.d;
    [C.orange, C.silver, C.yellow].forEach((c, i) => blk(ax ? len : 0.11, 0.11, ax ? 0.11 : len, c, k.x + (ax ? 0 : (i - 1) * 0.2), k.y + 0.3, k.z + (ax ? (i - 1) * 0.2 : 0)));
    for (let s = -1; s <= 1; s++) blk(ax ? 0.08 : 0.62, 0.26, ax ? 0.62 : 0.08, C.iron, k.x + (ax ? s * len * 0.4 : 0), k.y + 0.13, k.z + (ax ? 0 : s * len * 0.4));
  },
  cooler(k) { inRow(k, 1.25, (x, z) => { blk(1, 0.45, 1, C.silver, x, k.y + 0.23, z); disc(0.4, C.iron, x, k.y + 0.46, z); disc(0.12, C.steel, x, k.y + 0.47, z); }); },
  tankV(k, o) { inRow(k, 1.3, (x, z) => { tube(0.5, 1.1, C.white, x, k.y + 0.55, z); tube(0.51, 0.2, ACCENT[(o.tint + 2) % 5], x, k.y + 0.7, z); dome(0.5, 0.25, C.silver, x, k.y + 1.22, z); }); },
  flue(k) { tube(0.2, 1.3, C.iron, k.x, k.y + 0.65, k.z); tube(0.22, 0.2, C.red, k.x, k.y + 1.15, k.z); },
  deck(k, o) {   // a car park on the roof: bays along its north and south edges, and cars in some of them
    const n = Math.max(2, Math.floor(k.w / 1.2)), step = k.w / n;
    for (const s of k.d >= 3.6 ? [-1, 1] : [-1]) {
      const z = k.z + s * (k.d / 2 - 0.95);
      for (let i = 0; i <= n; i++) flat(0.06, 1.8, C.white, k.x - k.w / 2 + i * step, k.y + 0.05, z);
      for (let i = 0; i < n; i++) if ((i * 7 + o.tint + (s > 0 ? 1 : 0)) % 3) placed(k.x - k.w / 2 + (i + 0.5) * step, k.y + 0.04, z, s > 0 ? Math.PI : 0, () => THINGS.car(i * 3 + o.tint + (s > 0 ? 2 : 0)));
    }
  },
  sawtooth(k, o) {   // a saw-tooth roof: every tooth a slope and a band of glass toward the south, some of them lit
    const n = Math.max(2, Math.round(k.d / 1.5)), deep = k.d / n, roof = LOOKS[o.where].roofs[o.roof];
    for (let i = 0; i < n; i++) {
      const z = k.z - k.d / 2 + deep * (i + 0.5), lit = (i + o.tint) % 2 === 0;
      part(TOOTH, roof, k.w, k.h, deep, k.x, k.y, z);
      pane(k.w - 0.4, k.h * 0.6, lit ? C.cool : C.pane, k.x, k.y + k.h * 0.52, z + deep / 2 + 0.012, 0, lit);
    }
  },
  gable(k, o) {   // a pitched roof with two vents on its ridge
    const ax = k.w >= k.d, len = ax ? k.w : k.d, wide = ax ? k.d : k.w, roof = LOOKS[o.where].roofs[o.roof], rise = k.h - 0.18;
    part(GABLE, roof, len + 0.2, rise, wide + 0.3, k.x, k.y, k.z, ax ? null : { ry: Math.PI / 2 });
    blk(ax ? len + 0.26 : 0.16, 0.08, ax ? 0.16 : len + 0.26, C.silver, k.x, k.y + rise, k.z);
    for (const s of [-1, 1]) blk(ax ? 0.4 : 0.3, 0.2, ax ? 0.3 : 0.4, C.steel, k.x + (ax ? s * len * 0.25 : 0), k.y + rise + 0.06, k.z + (ax ? 0 : s * len * 0.25));
  },
};

const SMALL_ROOF = new Set(['skylight', 'solar', 'antenna', 'helipad', 'sign', 'vent', 'pipes']);

// ------------------------------------------------------------------------------------------ a building
/** A block with a flat roof: walls, a rim around the top and the roof inside it. */
function storey(q, y, h, wall, roof, trim, rim = true) {
  blk(q.w, h, q.d, wall, q.x, y + h / 2, q.z);
  if (!rim) return;
  const t = 0.16, top = y + h + PARAPET / 2;
  for (const s of [-1, 1]) { blk(q.w, PARAPET, t, trim, q.x, top, q.z + s * (q.d - t) / 2); blk(t, PARAPET, q.d - 2 * t, trim, q.x + s * (q.w - t) / 2, top, q.z); }
  flat(q.w - 2 * t, q.d - 2 * t, roof, q.x, y + h + 0.04, q.z);
  const seam = shade(roof, 0.84), n = Math.max(2, Math.round((q.w - 2 * t) / 1.3));   // the roof is laid in sheets: a seam between every two
  for (let i = 1; i < n; i++) flat(0.05, q.d - 2 * t, seam, q.x - q.w / 2 + t + (q.w - 2 * t) * i / n, y + h + 0.046, q.z);
}
/** Rows of windows on one face of a block ('s', 'e' or 'w'), some of them lit. An office wears a band of glass on every floor instead. */
function windows(q, y, h, face, seed, bands) {
  const len = face === 's' ? q.w : q.d, ry = face === 's' ? 0 : face === 'e' ? Math.PI / 2 : -Math.PI / 2;
  const floors = Math.max(1, Math.floor((h - 0.5) / 1.2)), cols = Math.max(1, Math.floor((len - 0.5) / 1.15)), tall = h / floors, pitch = (len - 0.5) / cols;
  const at = (off, yy, out) => (face === 's' ? [q.x + off, yy, q.z + q.d / 2 + out] : face === 'e' ? [q.x + q.w / 2 + out, yy, q.z - off] : [q.x - q.w / 2 - out, yy, q.z + off]);
  for (let f = 0; f < floors; f++) {
    const yy = y + tall * (f + 0.5);
    if (bands) pane(len - 0.5, tall * 0.62, C.pane, ...at(0, yy, 0.02), ry);
    for (let c = 0; c < cols; c++) {
      const lit = (f * 7 + c * 3 + seed) % 3 === 0;
      if (bands && !lit) continue;
      pane(bands ? pitch - 0.1 : 0.62, bands ? tall * 0.5 : Math.min(0.7, tall * 0.6), lit ? C.warm : C.pane, ...at((c - (cols - 1) / 2) * pitch, yy, bands ? 0.035 : 0.02), ry, lit);
    }
  }
}
/** The front of a building, by what it is: drawn from the middle of its street face on the ground, the street toward -z. */
const FRONTS = {
  shop(len, o) {   // a striped awning over a lit shop window
    const n = Math.max(4, Math.round(len / 0.7)), wide = (len - 0.2) / n;
    blk(len - 0.2, 0.05, 0.98, C.white, 0, 2.2, -0.47, { rx: -0.28 });
    for (let i = 0; i < n; i += 2) flat(wide, 0.98, ACCENT[o.tint % 5], -len / 2 + 0.1 + wide * (i + 0.5), 2.2317, -0.4791, { rx: -0.28 });   // the stripes, painted on it
    pane(len * 0.8, 1.2, C.warm, 0, 1.1, -0.02, Math.PI, true);
  },
  office(len) {   // a canopy on two posts over glass doors
    blk(1.7, 0.1, 0.8, C.white, 0, 2.3, -0.4); quiet(() => { for (const x of [-0.75, 0.75]) blk(0.07, 2.3, 0.07, C.steel, x, 1.15, -0.72); });
    pane(Math.min(1.4, len - 1), 1.9, 0x9fd6ef, 0, 0.95, -0.02, Math.PI, true);
  },
  flats(len, o) { blk(1.2, 0.08, 0.3, ACCENT[o.tint % 5], 0, 2.1, -0.15); pane(0.7, 1.7, C.trunk, 0, 0.85, -0.02, Math.PI); },
  hotel(len, o) {   // a long canopy on gold posts, its name in lights
    blk(2.4, 0.12, 1.1, ACCENT[o.tint % 5], 0, 2.4, -0.55); quiet(() => { for (const x of [-1.05, 1.05]) blk(0.08, 2.4, 0.08, C.gold, x, 1.2, -1); });
    pane(1.4, 1.9, C.warm, 0, 0.95, -0.02, Math.PI, true); blk(1.6, 0.2, 0.05, C.warm, 0, 2.56, -1.08, { glow: true });
  },
  garage(len) {   // the way in under a striped beam, and a blue sign
    pane(1.7, 1.7, C.black, 0, 0.85, -0.02, Math.PI);
    quiet(() => { for (let i = 0; i < 5; i++) blk(0.36, 0.2, 0.08, i % 2 ? C.black : C.yellow, -0.72 + i * 0.36, 1.82, -0.04); blk(0.5, 0.5, 0.1, 0x2f6fb0, len / 2 - 0.5, 2.5, -0.06); }); blk(0.12, 0.3, 0.02, C.white, len / 2 - 0.56, 2.5, -0.12, { glow: true });
  },
  factory(len, o) {   // a tall sliding door in a yellow frame, a lamp over it
    const tall = Math.min(2.6, o.h - 0.6);
    pane(1.9, tall, 0x4a6a7a, 0, tall / 2, -0.02, Math.PI);
    quiet(() => { for (const x of [-1, 1]) blk(0.1, tall, 0.06, C.yellow, x, tall / 2, -0.03); blk(2.1, 0.1, 0.06, C.yellow, 0, tall + 0.05, -0.03); }); blk(0.3, 0.1, 0.14, C.sodium, 0, tall + 0.3, -0.07, { glow: true });
  },
  warehouse(len, o) {   // a loading dock: a platform with a yellow edge, roller doors and a canopy
    const wide = len * 0.86, n = Math.max(2, Math.floor(wide / 1.6));
    quiet(() => { blk(wide, 0.45, 0.7, C.concrete, 0, 0.225, -0.35); blk(wide, 0.08, 0.06, C.yellow, 0, 0.45, -0.7); });
    for (let i = 0; i < n; i++) pane(1.1, 1.5, i % 2 ? C.silver : C.white, (i - (n - 1) / 2) * (wide / n), 1.25, -0.02, Math.PI);
    blk(len * 0.9, 0.08, 0.8, LOOKS[o.where].roofs[o.roof], 0, 2.3, -0.4, { rx: -0.12 });
  },
  plant(len) {   // a rack of pipes along the wall, and a warning sign
    quiet(() => {
      [C.orange, C.silver, C.yellow].forEach((c, i) => blk(len * 0.92, 0.11, 0.11, c, 0, i === 1 ? 1.75 : 1.55, -0.2 - i * 0.11));
      for (const x of [-len * 0.4, 0, len * 0.4]) { blk(0.08, 1.85, 0.08, C.iron, x, 0.92, -0.32); blk(0.08, 0.08, 0.5, C.iron, x, 1.44, -0.26); }
      blk(0.4, 0.4, 0.04, C.yellow, -len / 2 + 0.5, 1.1, -0.03);
    });
  },
};

function building(o) {
  const look = LOOKS[o.where], office = o.kind === 'office', garage = o.kind === 'garage';
  const wall = office ? look.glass[o.wall] : garage ? C.concrete : look.walls[o.wall], roof = garage ? C.deck : look.roofs[o.roof];
  const pitched = o.kit.some(k => k.kind === 'sawtooth' || k.kind === 'gable');
  const street = o.side === 's' ? null : o.side === 'w' ? 'e' : 'w';   // the face toward the street, where the camera can see it (never a north face)
  quiet(() => blk(o.w + 0.12, 0.28, o.d + 0.12, look.foot, o.x, 0.14, o.z));
  storey(o, 0, o.h, wall, o.tier ? look.trim : roof, look.trim, !pitched);
  windows(o, 0.2, o.h - 0.2, 's', o.tint, office);
  if (street) windows(o, o.kind === 'shop' ? 2.2 : 0.2, o.h - (o.kind === 'shop' ? 2.2 : 0.2), street, o.tint + 1, office);
  if (office) quiet(() => { for (let y = 1.25; y < o.h - 0.4; y += 1.25) blk(o.w + 0.06, 0.09, o.d + 0.06, look.trim, o.x, y, o.z); });   // a white band at every floor
  if (garage) quiet(() => { for (let y = 1.2; y < o.h - 0.3; y += 1.1) blk(o.w + 0.04, 0.34, o.d + 0.04, C.graphite, o.x, y, o.z); });   // open decks between concrete bands
  if (o.tier) {
    storey(o.tier, o.h, o.tier.h, wall, roof, look.trim);
    windows(o.tier, o.h + 0.1, o.tier.h - 0.1, 's', o.tint + 2, office);
    if (street) windows(o.tier, o.h + 0.1, o.tier.h - 0.1, street, o.tint + 3, office);
  }
  if (o.wing) {
    const g = o.wing;
    blk(g.w, g.h, g.d, o.where === 'city' ? look.walls[(o.wall + 2) % 5] : look.trim, g.x, g.h / 2, g.z);
    blk(g.w + 0.14, 0.12, g.d + 0.14, look.roofs[(o.roof + 1) % 5], g.x, g.h + 0.06, g.z);
    windows(g, 0.2, g.h - 0.2, 's', o.tint + 4, false);
  }
  for (const k of o.kit) if (SMALL_ROOF.has(k.kind)) quiet(() => ROOF[k.kind](k, o)); else ROOF[k.kind](k, o);
  // the front: from the middle of the face toward the street
  const len = o.side === 's' ? o.w : o.d, turn = o.side === 's' ? 0 : o.side === 'w' ? -Math.PI / 2 : Math.PI / 2;
  placed(o.side === 's' ? o.x : o.x + (o.side === 'w' ? o.w / 2 : -o.w / 2), 0, o.side === 's' ? o.z - o.d / 2 : o.z, turn, () => FRONTS[o.kind](len, o));
}

/** A striped chimney, as the city always had them, with a dark rim: the smoke rises from its top (CITY_STACKS). */
function chimney(x, z) {
  for (let i = 0; i < 6; i++) {
    const ring = box(1, 1, 1, i % 2 ? 0xf2f2f2 : 0xd4483b);
    ring.geometry = cylinderShape(0.85 - i * 0.05, 0.9 - i * 0.05, 1.6, 12); ring.position.set(x, 0.8 + i * 1.6, z); STILL.add(ring);
  }
  tube(0.62, 0.16, C.iron, x, 9.66, z, { seg: 12 });
  CITY_STACKS.push({ x, y: 9.8, z });
}

// ------------------------------------------------------------------------------------------ the ground
/** Flat ground as one mesh: rectangles [x0, x1, z0, z1] at height y, the picture laid out by the world's own measure. */
function groundOf(list, y, material, scale) {
  const pos = [], nor = [], uv = [], index = [];
  list.forEach(([xa, xb, za, zb], k) => {
    pos.push(xa, y, za, xa, y, zb, xb, y, zb, xb, y, za);
    for (const [x, z] of [[xa, za], [xa, zb], [xb, zb], [xb, za]]) { nor.push(0, 1, 0); uv.push(x / scale, -z / scale); }
    index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(index);
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'city-ground';
  return m;
}

let shine = null;
/** The one material of everything along the edge that shines after dark, each part in its own colour (js/sky.js turns it up at night). */
function shining(like) {
  if (shine) return shine;
  shine = mat(0xffffff, { vertexColors: true, map: like.map, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.3 });
  shine.userData.byDay = 0.3; GLOW.push(shine);
  shine.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;'); };
  return shine;
}

/** The pools of light under the street lamps, as one mesh that is only there at night: [x, z, size, colour]. */
function pools(list) {
  const pos = [], uv = [], col = [], index = [], c = new THREE.Color();
  list.forEach(([x, z, size, color], k) => {
    const h = size / 2;
    pos.push(x - h, 0.034, z - h, x - h, 0.034, z + h, x + h, 0.034, z + h, x + h, 0.034, z - h); uv.push(0, 1, 0, 0, 1, 0, 1, 1);
    c.set(color); for (let i = 0; i < 4; i++) col.push(c.r, c.g, c.b);
    index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(index);
  const light = new THREE.MeshBasicMaterial({ vertexColors: true, alphaMap: glowMap(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  light.userData.full = 0.55; light.visible = false; LIGHT.push(light);
  const m = new THREE.Mesh(geo, light);
  m.renderOrder = 3; m.matrixAutoUpdate = false; m.name = 'city-light';
  return m;
}

// ------------------------------------------------------------------------------------------ the whole edge
const STRETCH = 13;   // the edge is joined a stretch of street at a time, so that what is out of sight is not drawn

/**
 * What stands around Industrial City and the Metropolis, ready for the scene. Nothing here is taller than the camera
 * can see over (SIGHT in js/sim/site.js), and nothing lies under a yard: the yards draw their own ground.
 * @param rects  the yards the edge goes around
 * @param clear  ground to keep free (the building site's plot): the buildings that stood on it are left out
 */
export function makeCityEdge(rects, clear = []) {
  const g = new THREE.Group(); g.name = 'city-edge';
  // Where everything stands is worked out as plain numbers (js/sim/site.js, cityEdge), from fixed runs of numbers.
  const layout = cityEdge(rects, clear);
  const minX = Math.min(...rects.map(r => r.minX)), maxX = Math.max(...rects.map(r => r.maxX)), minZ = Math.min(...rects.map(r => r.minZ)), maxZ = Math.max(...rects.map(r => r.maxZ));

  // the ground: the asphalt under it all, and the pavements on it
  g.add(groundOf(layout.slabs, 0.006, soaks(mat(0x70757d, { ...ground('asphalt', 1, 1), roughness: 0.95 })), 6));
  for (const where of ['city', 'metropolis']) {
    const [kind, scale, color] = LOOKS[where].paving, list = layout.paving.filter(p => p[4] === where);
    if (list.length) g.add(groundOf(list, 0.012, soaks(mat(color, { ...ground(kind, 1, 1), roughness: 0.95 })), scale));
  }

  // everything else, a stretch of street at a time
  const stretches = new Map();
  const last = Math.ceil((maxX - minX) / STRETCH) - 1, ends = Math.max(1, Math.round((maxZ - minZ) / STRETCH));   // stretches along the south street, and along each end
  const stretch = (x, z) => {
    const key = z >= maxZ ? 's' + Math.max(0, Math.min(last, Math.floor((x - minX) / STRETCH))) : (x < (minX + maxX) / 2 ? 'w' : 'e') + Math.max(0, Math.min(ends - 1, Math.floor((z - minZ) / (maxZ - minZ) * ends)));
    if (!stretches.has(key)) stretches.set(key, { still: new THREE.Group(), lit: new THREE.Group() });
    const s = stretches.get(key); STILL = s.still; LIT = s.lit;
  };
  quiet(() => { for (const [xa, xb, za, zb] of layout.kerbs) { stretch((xa + xb) / 2, (za + zb) / 2); blk(xb - xa, 0.1, zb - za, C.kerb, (xa + xb) / 2, 0.05, (za + zb) / 2); } });
  for (const [x, z, w, d, turn, color, layer] of layout.marks) { stretch(x, z); flat(w, d, color, x, layer ? 0.028 : 0.02, z, turn ? { ry: turn } : null); }
  for (const [x, z, r] of layout.covers) { stretch(x, z); disc(r, C.cover, x, 0.03, z); disc(r * 0.72, 0x4a4f57, x, 0.032, z); disc(r * 0.3, C.cover, x, 0.034, z); }
  for (const [xa, xb, za, zb, where] of layout.rims) {   // a hedge in two greens, or a wall with a coping
    const x = (xa + xb) / 2, z = (za + zb) / 2, w = xb - xa, d = zb - za;
    stretch(x, z);
    if (where === 'city') { blk(w, 0.82, d, 0xb9b3a8, x, 0.41, z); quiet(() => blk(w + 0.08, 0.09, d + 0.08, 0x8a8f96, x, 0.865, z)); }
    else { blk(w, 0.42, d, 0x3f8a45, x, 0.21, z); quiet(() => blk(w - 0.1, 0.16, d - 0.1, LEAVES[0], x, 0.5, z)); }
  }
  for (const o of layout.buildings) { stretch(o.x, o.z); building(o); }
  for (const [x, z] of layout.chimneys) { stretch(x, z); chimney(x, z); }
  const lights = [];
  for (const p of layout.props) {
    stretch(p.x, p.z);
    const small = SMALL.has(p.kind);
    placed(p.x, 0, p.z, p.turn, () => (small ? quiet(() => THINGS[p.kind](p.tint)) : THINGS[p.kind](p.tint)));
    if (p.kind === 'lamp') lights.push([p.x - 0.72 * Math.sin(p.turn), p.z - 0.72 * Math.cos(p.turn), 6.5, 0xffd9a0]);
    if (p.kind === 'flood') lights.push([p.x - 0.9 * Math.sin(p.turn), p.z - 0.9 * Math.cos(p.turn), 8.5, 0xffc58a]);
  }
  STILL = LIT = null;

  // Join each stretch: the still things into one mesh, what shines into another. The blocks they were built from go.
  const keep = (root, lit) => {
    bake(root);
    const meshes = [];
    root.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      m.updateWorldMatrix(true, false); m.matrix.copy(m.matrixWorld); m.matrixAutoUpdate = false;
      if (lit && m.geometry.attributes.color) { m.material = shining(m.material); m.castShadow = false; }   // joined: every corner has its own colour to shine in
      m.name = lit ? 'city-lit' : m.castShadow ? 'city-still' : 'city-small';
      g.add(m);
    }
  };
  for (const s of stretches.values()) { keep(s.still, false); keep(s.lit, true); }
  if (lights.length) g.add(pools(lights));
  return g;
}

/**
 * For the catalogues in js/sim/site.js (EDGE_THINGS, ROOF_THINGS): what every thing measures as it is drawn here.
 * `things`: { kind: [length along the street, depth across it, height] }; `roofs`: { kind: how high it reaches over its roof },
 * each drawn in a room of 3 by 1.2.
 */
export function measureCityEdge() {
  const measure = draw => {
    const root = new THREE.Group();
    STILL = new THREE.Group(); LIT = new THREE.Group(); root.add(STILL, LIT);
    draw();
    STILL = LIT = null;
    return new THREE.Box3().setFromObject(root);
  };
  const things = {}, roofs = {};
  for (const kind in THINGS) { const b = measure(() => THINGS[kind](0)); things[kind] = [b.max.x - b.min.x, b.max.z - b.min.z, b.max.y].map(v => +v.toFixed(2)); }
  for (const kind in ROOF) { const b = measure(() => ROOF[kind]({ kind, x: 0, z: 0, w: 3, d: 1.2, y: 0, h: 0.8, face: 's' }, { where: 'metropolis', tint: 0, roof: 0, wall: 0, h: 4 })); roofs[kind] = +b.max.y.toFixed(2); }
  return { things, roofs };
}
