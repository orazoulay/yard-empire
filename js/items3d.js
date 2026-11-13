// Small meshes for carried / stored items, built from the item's `mesh` spec in the data file.
import * as THREE from 'three';
import { ITEMS } from './data/areas.js';
import { bark, rings, wood } from './textures.js';
import { roundedBox } from './world.js';
import { Batch, blockPart, merge, roundPart, shade, solid } from './models.js';
import { padSlot } from './sim/yard.js';

const cache = new Map();   // item type -> { geo, mat } or a builder for multi-part items

// What an item is made of (the `finish` of its mesh in the data file) decides how it takes the light.
const FINISH = {
  wood: () => wood(),
  metal: () => ({ metalness: 0.9, roughness: 0.32, envMapIntensity: 0.8 }),
  gold: () => ({ metalness: 1, roughness: 0.2, envMapIntensity: 0.95 }),
  glass: () => ({ roughness: 0.05, metalness: 0.2, envMapIntensity: 1 }),
  gem: () => ({ roughness: 0.08, metalness: 0.25, envMapIntensity: 1.1 }),
  barrel: () => ({ metalness: 0.6, roughness: 0.4, envMapIntensity: 0.7 }),
  plastic: () => ({ roughness: 0.35 }),
  stone: () => ({ roughness: 0.96 }),
};
const surface = (color, { opacity, finish } = {}, extra = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.8, metalness: 0, envMapIntensity: 0.42, ...(FINISH[finish]?.() || {}),
  ...(opacity != null && opacity < 1 ? { transparent: true, opacity } : {}), ...extra,
});

// Goods that are more than a plain block. Each is built from a few parts and merged into one mesh
// (see js/models.js), because they are drawn many times: in hands, on pads and on shop counters.
// They keep the size the data file gives them, so stacks stay as tall as they were.
const rounded = (w, h, d, r, color, at, turn) => ({ geo: roundedBox(w, h, d, r, 1), color, at, turn });
const lying = [Math.PI / 2, 0, 0];   // a cylinder turned to lie along z
const MODELS = {
  /** A loaf: rounded all over, with three cuts across the crust. */
  bread: ({ color }) => merge([
    { geo: new THREE.CapsuleGeometry(0.13, 0.3, 3, 8).rotateZ(Math.PI / 2), color, scale: [1, 0.9, 1.12] },
    ...[-0.13, 0, 0.13].map(x => blockPart(0.03, 0.02, 0.2, 0xf6dfae, [x, 0.112, 0], [0, 0.5, 0])),
  ]),
  /** A sack lying flat: soft edges, the tied end sticking out, a stamp on top. */
  flour: ({ color }) => merge([
    rounded(0.46, 0.3, 0.36, 0.11, color),
    blockPart(0.08, 0.1, 0.16, shade(color, 0.86), [0.25, 0.04, 0]),
    blockPart(0.18, 0.012, 0.16, 0xc0392b, [-0.03, 0.151, 0]),
  ]),
  /** A drum: three rolled rims, a sunk lid and a bung. Crude oil and fuel differ in colour only. */
  crude: spec => drum(spec),
  fuel: spec => drum(spec),
  /** A pane lying flat: the sheet, and around it the darker cut edge that makes glass look like glass. */
  glass: ({ color }) => merge([
    blockPart(0.64, 0.04, 0.64, color),
    ...[-0.335, 0.335].map(z => blockPart(0.7, 0.07, 0.03, 0x4fb6d6, [0, 0, z])),
    ...[-0.335, 0.335].map(x => blockPart(0.03, 0.07, 0.64, 0x4fb6d6, [x, 0, 0])),
  ]),
  /** An engine: block, sump, a red valve cover, the flywheel at one end and a manifold along the side. */
  engine: ({ color }) => merge([
    blockPart(0.24, 0.05, 0.3, 0x3a424c, [0, 0.025, 0]),
    blockPart(0.3, 0.16, 0.34, color, [0, 0.13, 0]),
    blockPart(0.26, 0.06, 0.3, shade(color, 1.18), [0, 0.24, 0]),
    blockPart(0.14, 0.05, 0.3, 0xd63a2f, [-0.02, 0.295, 0]),
    roundPart(0.115, 0.115, 0.04, 0x2b3037, [0, 0.13, 0.19], lying, 12),
    roundPart(0.05, 0.05, 0.035, 0x2b3037, [0, 0.13, -0.187], lying, 8),
    blockPart(0.05, 0.05, 0.28, 0x6a7078, [0.175, 0.19, 0]),
  ]),
  /** A car: body, a dark glass cabin with a painted roof, four wheels and lights. */
  car: ({ color }) => merge([
    rounded(0.8, 0.13, 0.38, 0.045, color, [0, -0.025, 0]),
    rounded(0.4, 0.085, 0.33, 0.035, 0x22303c, [-0.04, 0.078, 0]),
    blockPart(0.32, 0.012, 0.29, color, [-0.04, 0.123, 0]),
    ...[[0.25, 0.185], [0.25, -0.185], [-0.25, 0.185], [-0.25, -0.185]].map(([x, z]) => roundPart(0.06, 0.06, 0.05, 0x1d1f22, [x, -0.07, z], lying, 8)),
    blockPart(0.02, 0.035, 0.3, 0xfff3b0, [0.398, -0.015, 0]),
    blockPart(0.02, 0.03, 0.3, 0x9c1f1f, [-0.398, -0.015, 0]),
  ]),
  /** A robot: a head with a visor and two eyes, a body with a chest light, arms, a base and an aerial. */
  robot: ({ color }) => merge([
    blockPart(0.26, 0.07, 0.26, 0x3a424c, [0, -0.205, 0]),
    rounded(0.26, 0.2, 0.2, 0.045, color, [0, -0.07, 0]),
    blockPart(0.08, 0.05, 0.012, 0x3aa0ff, [0, -0.05, 0.1]),
    rounded(0.2, 0.14, 0.18, 0.04, color, [0, 0.11, 0]),
    blockPart(0.15, 0.05, 0.012, 0x1b2733, [0, 0.12, 0.09]),
    ...[-0.04, 0.04].map(x => blockPart(0.03, 0.025, 0.014, 0x5ff0ff, [x, 0.12, 0.093])),
    ...[-0.155, 0.155].map(x => blockPart(0.05, 0.18, 0.07, shade(color, 0.8), [x, -0.07, 0])),
    roundPart(0.008, 0.008, 0.05, 0x3a424c, [0.05, 0.203, 0], [0, 0, 0], 5),
    blockPart(0.024, 0.024, 0.024, 0xff5a52, [0.05, 0.228, 0]),
  ]),
};
function drum({ r, h, color }) {
  const rim = shade(color, 0.72), R = r - 0.012;
  return merge([
    roundPart(R, R, h, color, [0, h / 2, 0], [0, 0, 0], 12),
    ...[0.018, h / 2, h - 0.018].map(y => roundPart(r, r, 0.036, rim, [0, y, 0], [0, 0, 0], 12)),
    roundPart(R - 0.035, R - 0.035, 0.012, shade(color, 0.86), [0, h + 0.003, 0], [0, 0, 0], 12),
    roundPart(0.035, 0.035, 0.016, rim, [r * 0.45, h + 0.012, 0], [0, 0, 0], 6),
  ]);
}

function parts(type) {
  if (cache.has(type)) return cache.get(type);
  const spec = ITEMS[type]?.mesh || { shape: 'box', size: [0.5, 0.2, 0.3], color: 0xffffff };
  let p;
  if (MODELS[type]) {
    p = { geo: MODELS[type](spec), mat: surface(0xffffff, spec, { vertexColors: true }) };   // the colours are in the shape itself
    cache.set(type, p);
    return p;
  }
  switch (spec.shape) {
    case 'log':   p = { geo: new THREE.CylinderGeometry(0.17, 0.17, 1.1, 10).rotateZ(Math.PI / 2), log: true }; break;
    case 'box':   p = { geo: new THREE.BoxGeometry(...spec.size) }; break;
    case 'cyl':   p = { geo: new THREE.CylinderGeometry(spec.r, spec.r, spec.h, 12).translate(0, spec.h / 2, 0) }; break;
    case 'rock':  p = { geo: new THREE.DodecahedronGeometry(spec.r, 0).scale(1, 0.75, 1).translate(0, spec.r * 0.6, 0), flat: true }; break;
    case 'gem':   p = { geo: new THREE.OctahedronGeometry(spec.r, 0).translate(0, spec.r, 0), flat: true }; break;
    case 'torus': p = { geo: new THREE.TorusGeometry(spec.r, spec.r * 0.32, 8, 18).rotateX(Math.PI / 2).translate(0, spec.r * 0.32, 0) }; break;
    default:      p = { group: spec.shape };
  }
  if (p.log) {
    // a log is bark around and cut wood at both ends: one material for the side, one for the two caps
    const side = surface(spec.color, {}, bark()), end = surface(0xffffff, {}, rings());
    p.mat = [side, end, end];
  } else p.mat = surface(spec.color, spec, p.flat ? { flatShading: true } : {});
  cache.set(type, p);
  return p;
}

const SEAT_GEO = new THREE.BoxGeometry(0.5, 0.07, 0.5);
const BACK_GEO = new THREE.BoxGeometry(0.5, 0.45, 0.07);
const LEG_GEO = new THREE.BoxGeometry(0.06, 0.3, 0.06);
const HANDLE_GEO = new THREE.BoxGeometry(0.7, 0.08, 0.08);
const HEAD_GEO = new THREE.BoxGeometry(0.16, 0.2, 0.3);
const HANDLE_MAT = new THREE.MeshStandardMaterial({ color: 0x9c6b3c, roughness: 0.85, envMapIntensity: 0.42 });

/** Vertical distance between stacked items of a type. */
export function stackStep(type) {
  const m = ITEMS[type]?.mesh;
  if (!m) return 0.2;
  if (m.step) return m.step;
  if (m.shape === 'box') return m.size[1] + 0.01;
  if (m.shape === 'cyl') return m.h + 0.02;
  if (m.shape === 'rock') return m.r * 1.15;
  if (m.shape === 'gem') return m.r * 1.7;
  return 0.25;
}

/** How far below its own middle an item reaches: what it must be lifted by to stand on a surface instead of in it. */
export function stackBase(type) {
  const m = ITEMS[type]?.mesh;
  if (!m) return 0;
  if (m.shape === 'box') return m.size[1] / 2;
  if (m.shape === 'log') return 0.17;
  return 0;   // everything else is made standing on the ground
}
/** The longest side of an item, for showing one at a set size (on a machine's sign). */
export function itemSize(type) {
  const m = ITEMS[type]?.mesh;
  if (!m) return 0.5;
  if (m.shape === 'box') return Math.max(...m.size);
  if (m.shape === 'cyl') return Math.max(m.r * 2, m.h);
  if (m.shape === 'log') return 1.1;
  if (m.shape === 'chair' || m.shape === 'hammer') return 0.75;
  return (m.r || 0.25) * 2.4;
}

// Pallets under the stacks on the pads: one shape, drawn together for the whole map.
const PALLET = { w: 1.5, d: 1.5, h: 0.11 };
let pallets = null;
/** Put a pallet w by d on the ground or a belt at (x, y, z), in the world. Returns how high its deck is. */
export function addPallet(scene, x, y, z, w = PALLET.w, d = PALLET.d) {
  if (!pallets) {
    const W = PALLET.w, D = PALLET.d, boards = [];
    for (const px of [-0.62, 0, 0.62]) boards.push(blockPart(0.14, 0.07, D, 0xb98d57, [px, 0.035, 0]));                                 // the runners it stands on
    [-0.62, -0.31, 0, 0.31, 0.62].forEach((pz, i) => boards.push(blockPart(W, 0.04, 0.24, i % 2 ? 0xd9b47c : 0xcfa76c, [0, 0.09, pz])));   // the deck
    pallets = new Batch(scene, merge(boards), solid(wood({ rx: 2 })), 170);
  }
  pallets.add(x, y, z, { sx: w / PALLET.w, sy: 1, sz: d / PALLET.d });
  return PALLET.h;
}

export function makeItem(type) {
  const p = parts(type);
  if (p.geo) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; return m; }
  const g = new THREE.Group();
  if (p.group === 'chair') {
    const seat = new THREE.Mesh(SEAT_GEO, p.mat); seat.position.y = 0.3; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(BACK_GEO, p.mat); back.position.set(0, 0.55, -0.22); back.castShadow = true; g.add(back);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const l = new THREE.Mesh(LEG_GEO, p.mat); l.position.set(x, 0.15, z); g.add(l);
    }
  } else { // hammer
    const handle = new THREE.Mesh(HANDLE_GEO, HANDLE_MAT); handle.position.y = 0.1; g.add(handle);
    const head = new THREE.Mesh(HEAD_GEO, p.mat); head.position.set(0.3, 0.1, 0); head.castShadow = true; g.add(head);
  }
  return g;
}

const FLY = 0.2;    // seconds a new item takes to reach its place
const POP = 0.12;   // seconds of the small bounce when it lands
const ease = k => 1 - Math.pow(1 - k, 3);

/**
 * Keeps a THREE.Group showing up to `maxVisible` items of `type` stacked upward.
 * A new item does not just appear: it flies in from `from` along a small arc, shrunk at first, and
 * bounces once when it lands. A stack that is carried can also lean (leanX, leanZ), more the higher
 * the item, so a tall stack sways like a tower of planks and not like one solid block.
 */
export class Stack {
  /** @param from  where a new item comes from, in the stack's own space ({ x, y, z }); without it items pop up in place */
  constructor(parent, { spread = 0, maxVisible = 24, from = null } = {}) {
    this.group = new THREE.Group(); parent.add(this.group);
    this.meshes = []; this.type = null; this.spread = spread; this.maxVisible = maxVisible;
    this.from = from; this.clock = 0;
    this.leanX = 0; this.leanZ = 0;
    this.settled = true;   // nothing is arriving: animate() has nothing to move unless the stack leans
  }
  /** @param instant  true to put new items straight in their place: for a stack that was out of sight and is caught up */
  set(type, count, instant = false) {
    count = Math.min(count, this.maxVisible);
    if (instant) this.clock += 1;   // whatever was in the air when the stack went out of sight has landed by now
    if (this.type !== type) { for (const m of this.meshes) this.group.remove(m); this.meshes = []; this.type = type; }
    if (!type) return;
    const step = stackStep(type);
    const base = this.spread ? stackBase(type) : 0;   // on a pad the goods stand on the pallet, not half in it
    while (this.meshes.length < count) {
      const i = this.meshes.length, m = makeItem(type);
      if (this.spread) {   // on a pad: two to a layer, every other layer turned a quarter
        const slot = m.userData.slot = padSlot(i, step, this.spread);
        slot.y += base; m.rotation.y = slot.turn;
      } else {             // in the hands: one tower
        m.userData.slot = { x: 0, y: i * step, z: 0 };
        m.rotation.y = (i % 2) * 0.08;
      }
      m.userData.born = instant ? this.clock - 1 : this.clock;
      this.place(m, instant ? 1 : 0);
      this.group.add(m); this.meshes.push(m);
      if (!instant) this.settled = false;
    }
    while (this.meshes.length > count) this.group.remove(this.meshes.pop());
  }
  /** Put one item where it belongs `age` seconds after it was added. */
  place(m, age) {
    const slot = m.userData.slot, k = Math.min(1, age / FLY);
    let x = slot.x, y = slot.y, z = slot.z, scale = 1;
    if (k < 1) {
      const e = ease(k), f = this.from;
      if (f) { x = f.x + (slot.x - f.x) * e; y = f.y + (slot.y - f.y) * e + Math.sin(Math.PI * k) * 0.5; z = f.z + (slot.z - f.z) * e; }
      scale = 0.35 + 0.65 * e;
    } else if (age < FLY + POP) scale = 1 + 0.18 * Math.sin(Math.PI * (age - FLY) / POP);
    const h = slot.y * (1 + 0.15 * slot.y);   // the lean grows faster than the height: a curve, not a straight tilt
    m.position.set(x + this.leanX * h, y, z + this.leanZ * h);
    m.rotation.x = this.leanZ * 0.5; m.rotation.z = -this.leanX * 0.5;
    m.scale.setScalar(scale);
  }
  /** Once a frame: move the items that are still arriving, and lean the stack. */
  animate(dt) {
    this.clock += dt;
    if (this.settled && this.leanX === 0 && this.leanZ === 0) return;
    let arriving = false;
    for (const m of this.meshes) {
      const age = this.clock - m.userData.born;
      if (age < FLY + POP) arriving = true;
      this.place(m, age);
    }
    this.settled = !arriving;
  }
  get height() { return this.type ? this.meshes.length * stackStep(this.type) : 0; }
}
