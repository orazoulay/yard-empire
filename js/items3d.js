// @ts-check
// Goods in the world: one item (makeItem), a stack of them in hands or on a pad (Stack), and the pallets under the stacks.
// What each product looks like is in js/gfx/products.js; here they are placed, stacked and moved.
import * as THREE from 'three';
import { ITEMS } from './data/areas.js';
import { wood } from './textures.js';
import { Batch, blockPart, merge, solid } from './models.js';
import { padSlot } from './sim/yard.js';
import { productShape } from './gfx/products.js';

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

/** One item of `type` as a mesh of its own: a sample on a counter or a sign, an item sliding over a counter. */
export function makeItem(type) {
  const p = productShape(type);
  const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true;
  return m;
}

const FLY = 0.2;    // seconds a new item takes to reach its place
const POP = 0.12;   // seconds of the small bounce when it lands
const ease = k => 1 - Math.pow(1 - k, 3);

const stacks = new Set();   // every stack in the game, so that a change of graphics level reaches them all
let smallShadows = true;
/** Whether goods in stacks cast shadows: the richer graphics levels only (js/engine/quality.js, smallShadows). */
export function setSmallShadows(on) {
  if (on === smallShadows) return;
  smallShadows = on;
  for (const s of stacks) if (s.mesh) s.mesh.castShadow = on;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

/**
 * Keeps a THREE.Group showing up to `maxVisible` items of `type` stacked upward, drawn together in one go (an
 * InstancedMesh of the product's shape: a stack of 24 planks is one draw, not 24).
 * A new item does not just appear: it flies in from `from` along a small arc, shrunk at first, and
 * bounces once when it lands. A stack that is carried can also lean (leanX, leanZ), more the higher
 * the item, so a tall stack sways like a tower of planks and not like one solid block.
 */
export class Stack {
  /** @param from  where a new item comes from, in the stack's own space ({ x, y, z }); without it items pop up in place */
  constructor(parent, { spread = 0, maxVisible = 24, from = null } = {}) {
    this.group = new THREE.Group(); parent.add(this.group);
    this.mesh = null; this.slots = []; this.type = null; this.spread = spread; this.maxVisible = maxVisible;
    this.from = from; this.clock = 0;
    this.leanX = 0; this.leanZ = 0;
    this.settled = true;   // nothing is arriving: animate() has nothing to move unless the stack leans
    stacks.add(this);
  }
  /** How many items show. */
  get count() { return this.slots.length; }
  /** @param instant  true to put new items straight in their place: for a stack that was out of sight and is caught up */
  set(type, count, instant = false) {
    count = Math.min(count, this.maxVisible);
    if (instant) this.clock += 1;   // whatever was in the air when the stack went out of sight has landed by now
    if (this.type !== type) {
      if (this.mesh) { this.group.remove(this.mesh); this.mesh.dispose(); this.mesh = null; }
      this.slots = []; this.type = type;
      if (type) {
        const p = productShape(type);
        this.mesh = new THREE.InstancedMesh(p.geo, p.mat, this.maxVisible);
        this.mesh.count = 0; this.mesh.castShadow = smallShadows; this.mesh.receiveShadow = true;
        this.mesh.frustumCulled = false;   // its items move; whoever holds the stack is hidden whole when out of sight
        this.group.add(this.mesh);
      }
    }
    if (!type) return;
    const step = stackStep(type);
    const base = this.spread ? stackBase(type) : 0;   // on a pad the goods stand on the pallet, not half in it
    let changed = false;
    while (this.slots.length < count) {
      const i = this.slots.length;
      let slot;
      if (this.spread) {   // on a pad: two to a layer, every other layer turned a quarter
        slot = padSlot(i, step, this.spread); slot.y += base;
      } else {             // in the hands: one tower
        slot = { x: 0, y: i * step, z: 0, turn: (i % 2) * 0.08 };
      }
      slot.born = instant ? this.clock - 1 : this.clock;
      this.slots.push(slot);
      this.place(i, instant ? 1 : 0);
      if (!instant) this.settled = false;
      changed = true;
    }
    if (this.slots.length > count) { this.slots.length = count; changed = true; }
    if (changed) { this.mesh.count = this.slots.length; this.mesh.instanceMatrix.needsUpdate = true; }
  }
  /** Put item i where it belongs `age` seconds after it was added. */
  place(i, age) {
    const slot = this.slots[i], k = Math.min(1, age / FLY);
    let x = slot.x, y = slot.y, z = slot.z, scale = 1;
    if (k < 1) {
      const e = ease(k), f = this.from;
      if (f) { x = f.x + (slot.x - f.x) * e; y = f.y + (slot.y - f.y) * e + Math.sin(Math.PI * k) * 0.5; z = f.z + (slot.z - f.z) * e; }
      scale = 0.35 + 0.65 * e;
    } else if (age < FLY + POP) scale = 1 + 0.18 * Math.sin(Math.PI * (age - FLY) / POP);
    const h = slot.y * (1 + 0.15 * slot.y);   // the lean grows faster than the height: a curve, not a straight tilt
    _p.set(x + this.leanX * h, y, z + this.leanZ * h);
    _q.setFromEuler(_e.set(this.leanZ * 0.5, slot.turn, -this.leanX * 0.5));
    this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(scale)));
  }
  /** Once a frame: move the items that are still arriving, and lean the stack. */
  animate(dt) {
    this.clock += dt;
    if (!this.mesh || (this.settled && this.leanX === 0 && this.leanZ === 0 && !this.leaned)) return;
    let arriving = false;
    for (let i = 0; i < this.slots.length; i++) {
      const age = this.clock - this.slots[i].born;
      if (age < FLY + POP) arriving = true;
      this.place(i, age);
    }
    this.leaned = this.leanX !== 0 || this.leanZ !== 0;   // one more pass after the lean ends puts the items back upright
    this.mesh.instanceMatrix.needsUpdate = true;
    this.settled = !arriving;
  }
  get height() { return this.type ? this.slots.length * stackStep(this.type) : 0; }
}
