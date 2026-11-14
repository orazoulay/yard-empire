// Machine models: what each processor looks like, built in code from the parts kit (js/gfx/kit.js).
//
// Every recipe has a machine of its own that shows what it does: a log runs into a circular saw, ore rides a skip up a
// blast furnace, a car body sits under a welding gantry. They come in families (wood, stone, food, glass, metal,
// jewellery, energy, advanced manufacturing) that share parts and proportions, and each is painted in its recipe's
// colours (body and accent) so every yard reads differently.
//
// The layout of a machine, in its own space: its middle on the ground, the belt and pads in front at z ≈ +2.1, materials
// arriving at the left (-x) and goods leaving at the right (+x). A body stays inside x ±3.3 and z -1.5..+1.25 and below
// about 4.6, tall parts at the back so that the camera (from +z, above) sees the work in front.
//
// buildMachine() builds the body, dresses it (a sign with its product, a hopper for loose material, a second feed, a
// lit strip in the Metropolis) and returns how it moves while it runs. Moving parts are rigged (kit.rig) so that the
// station can join everything else into a few meshes (js/engine/bake.js). Nothing here knows the rules of the game.
import * as THREE from 'three';
import { lit } from '../world.js';
import { wood } from '../textures.js';
import { itemSize, makeItem, stackBase } from '../items3d.js';
import { ITEMS, RECIPES } from '../data/areas.js';
import { moving } from '../engine/bake.js';
import { shade } from '../models.js';
import {
  INK, STEEL, BRASS, PANEL, GLASS, GEO, hot, put, block, rod, part, pivot, rig, smokes,
  pipe, tank, chimney, motor, cabinet, gauge, frame, hazard, roller, wheel, pile, glowing, robotArm,
} from './kit.js';

const TAU = Math.PI * 2;
/** One product as a model on a machine, `k` times its size, standing at (x, y, z). */
function sample(p, type, k, x, y, z, turn = 0) {
  const m = makeItem(type); m.scale.setScalar(k); m.rotation.y = turn;
  return put(p, m, x, y + stackBase(type) * k, z);
}
/** The plinth most machines stand on. */
const plinth = (g, color, h = 0.25, o) => block(g, 6.3, h, 2.55, color, 0, h / 2, -0.12, o);
/** Fire, molten metal and glowing cores: brighter and darker in turn while running, embers when stopped. */
function flicker(m, t, power, a, b, ember) {
  if (power < 0.1) { m.color.setHex(ember); return; }
  m.color.setHex(Math.sin(t * 17) + Math.sin(t * 6.3) > 0 ? a : b);
}
const tri = (t, rate) => 0.5 - 0.5 * Math.cos(t * rate);   // 0..1..0, smooth

/**
 * The machines. Each builds into `g` with the recipe's colours `c` and returns
 *   animate(t, dt, power): called while it runs (t and dt already slowed by power) and once more with power 0;
 *   fit: where the dressing goes: hopper [x, y, z] on top of the intake, feed (height of a second feed's chute),
 *        neon [y, z, width, x] (the lit strip of the Metropolis).
 */
const MACHINES = {
  // ---------------------------------------------------------------- wood
  /** A log rides in over rollers to a big circular saw under its hood; planks leave on the right; a cyclone takes the dust. */
  saw(g, c) {
    plinth(g, INK.iron, 0.22);
    block(g, 5.9, 0.72, 1.9, c.body, 0, 0.58, -0.15, { ...PANEL(), round: 0.08 });
    block(g, 6.0, 0.07, 2.0, INK.steel, 0, 0.975, -0.15, STEEL);
    for (const z of [-0.95, 0.65]) block(g, 2.0, 0.2, 0.08, c.accent, -2.0, 1.11, z);
    block(g, 2.0, 0.2, 0.08, c.accent, 2.0, 1.11, -0.95);
    const rolls = [-2.6, -1.7, 1.7, 2.6].map(x => roller(g, 0.08, 1.4, INK.steel, x, 1.03, -0.15));
    pile(g, 'log', [[-2.1, 1.11, -0.15, 0, 1.3]]);
    pile(g, 'plank', [[2.15, 1.11, -0.15, 0, 1], [2.2, 1.24, -0.12, 0.06, 1]]);
    // the saw: a hood behind it in the accent colour, the blade in front, the motor at the back
    part(g, GEO.vault(1.0, 0.32, 12), c.accent, 0, 1.01, -0.05);
    const blade = pivot(g, 0, 1.0, 0.3);
    part(blade, GEO.blade(0.86, 18, 0.05), INK.steel, 0, 0, 0, STEEL);
    rod(blade, 0.17, 0.14, 0xd63a2f, 0, 0, 0, 'z', undefined, 10);
    block(blade, 0.08, 0.2, 0.16, INK.dark, 0, 0.06, 0);
    rig(blade);
    motor(g, c.accent, 1.15, 1.32, -0.85, 0.8, 0.28);
    block(g, 1.05, 0.06, 0.06, INK.rubber, 0.55, 1.2, -0.55).rotation.y = -0.5;   // the belt to the arbor
    // the dust: a duct from the hood to a cyclone that fills a bag
    pipe(g, [[0, 2.0, -0.2], [0, 2.55, -0.2], [-1.05, 2.55, -0.9]], 0.1, INK.steel, STEEL);
    rod(g, 0.36, 0.6, INK.cream, -1.25, 2.4, -0.95, 'y', undefined, 12);
    part(g, GEO.cone(0.36, 0.6, 12), INK.cream, -1.25, 1.8, -0.95).rotation.x = Math.PI;
    rod(g, 0.22, 0.32, 0xd9c49a, -1.25, 1.22, -0.95, 'y', undefined, 10, 0.18);
    frame(g, 0.7, 1.7, 0.7, INK.iron, -1.25, 1.01, -0.95, { post: 0.06, beam: false });
    cabinet(g, INK.cream, 2.6, 1.01, -0.95, { w: 0.6, h: 0.8, d: 0.35 });
    return {
      animate(t, dt) { blade.rotation.z -= dt * 16; for (const r of rolls) r.rotation.z -= dt * 5; },
      fit: { hopper: [-2.3, 1.05, -0.6], feed: 1.0, neon: [0.62, 0.81, 5.6] },
    };
  },
  /** A carpenter's shop: a bench with a vice, a chair under a swinging mallet, a drill press and tools on the wall. */
  workshop(g, c) {
    block(g, 6.3, 0.18, 2.6, INK.wood, 0, 0.09, -0.15, wood({ rx: 3 }));
    block(g, 6.0, 2.5, 0.16, c.body, 0, 1.43, -1.35, wood({ upright: true, rx: 3 }));
    block(g, 2.6, 1.0, 0.04, INK.cream, -0.7, 1.95, -1.25);
    // tools on the pegboard: a saw, a square, a hammer and a wrench
    block(g, 0.55, 0.18, 0.02, INK.steel, -1.55, 2.1, -1.22, STEEL); block(g, 0.12, 0.14, 0.04, 0xd63a2f, -1.25, 2.1, -1.21);
    block(g, 0.06, 0.5, 0.02, INK.steel, -0.95, 2.0, -1.22, STEEL); block(g, 0.3, 0.06, 0.02, INK.steel, -0.82, 1.78, -1.22, STEEL);
    block(g, 0.05, 0.45, 0.04, INK.wood, -0.4, 1.95, -1.21); block(g, 0.22, 0.1, 0.06, INK.iron, -0.4, 2.18, -1.2);
    block(g, 0.05, 0.4, 0.03, INK.steel, 0.05, 1.95, -1.21, STEEL);
    const roof = block(g, 6.5, 0.12, 1.3, c.accent, 0, 2.85, -0.9); roof.rotation.x = 0.28;
    for (const x of [-2.9, 2.9]) block(g, 0.1, 0.1, 0.9, INK.walnut, x, 2.55, -0.95).rotation.x = -0.6;
    // the bench, its shelf with planks, and a vice at the left end
    block(g, 3.0, 0.12, 1.0, 0xc9965c, -0.7, 1.02, 0.15, wood({ rx: 2 }));
    frame(g, 2.8, 0.84, 0.9, INK.walnut, -0.7, 0.18, 0.15, { post: 0.1, beam: false });
    block(g, 2.7, 0.05, 0.8, INK.walnut, -0.7, 0.45, 0.15);
    pile(g, 'plank', [[-1.2, 0.475, 0.15, 0, 1], [-1.15, 0.6, 0.15, 0.04, 1], [-0.1, 0.475, 0.2, 0, 0.9]]);
    block(g, 0.32, 0.22, 0.12, c.accent, -2.0, 1.19, 0.5); block(g, 0.32, 0.22, 0.1, c.accent, -2.0, 1.19, 0.78);
    rod(g, 0.025, 0.5, INK.steel, -2.0, 1.12, 0.78, 'z', STEEL, 6); rod(g, 0.02, 0.4, INK.steel, -2.0, 1.12, 1.02, 'x', STEEL, 6);
    sample(g, 'chair', 1.45, -0.55, 1.08, 0.2);
    // the mallet, on an arm from a post behind the chair
    rod(g, 0.06, 1.45, INK.iron, -0.55, 1.8, -0.4, 'y', undefined, 8);
    const arm = pivot(g, -0.55, 2.5, -0.4);
    block(arm, 0.08, 0.08, 0.82, INK.iron, 0, 0, 0.38);
    block(arm, 0.06, 0.5, 0.06, INK.wood, 0, -0.25, 0.76);
    block(arm, 0.32, 0.17, 0.17, 0x7a2e22, 0, -0.55, 0.76);
    rig(arm);
    // a drill press at the right
    block(g, 0.7, 0.08, 0.6, INK.iron, 2.1, 0.22, -0.4);
    rod(g, 0.06, 2.0, INK.steel, 2.1, 1.22, -0.62, 'y', STEEL, 8);
    block(g, 0.5, 0.05, 0.45, INK.iron, 2.1, 1.0, -0.32);
    pile(g, 'plank', [[2.1, 1.025, -0.32, 0.4, 0.45]]);
    block(g, 0.46, 0.42, 0.62, c.accent, 2.1, 2.05, -0.45, { round: 0.05 });
    rod(g, 0.15, 0.36, c.accent, 2.1, 2.42, -0.62, 'y', undefined, 10);
    const quill = pivot(g, 2.1, 1.78, -0.32);
    rod(quill, 0.05, 0.22, INK.steel, 0, 0, 0, 'y', STEEL, 8);
    rod(quill, 0.015, 0.3, INK.dark, 0, -0.25, 0, 'y', undefined, 5);
    block(quill, 0.1, 0.02, 0.02, INK.dark, 0, 0.05, 0.05);
    rig(quill);
    // a lamp over the bench, lit after dark
    rod(g, 0.01, 0.5, INK.dark, 0.6, 2.42, -0.15, 'y', undefined, 4);
    part(g, GEO.cone(0.2, 0.18, 10), 0x2f6a4a, 0.6, 2.12, -0.15);
    lit(part(g, GEO.ball(0.07, 8), 0xfff1c2, 0.6, 2.02, -0.15), 0xffd27a, 0.15);
    return {
      animate(t, dt, power) {
        const k = power < 0.05 ? 0 : Math.max(0, Math.sin(t * 6.5));
        arm.rotation.x = -0.4 + k * 0.48;
        quill.rotation.y += dt * 30; quill.position.y = 1.78 - 0.16 * tri(t, 1.7) * (power > 0.05 ? 1 : 0);
      },
      fit: { hopper: [-2.4, 1.1, -0.6], feed: 1.0, neon: [0.12, 1.17, 5.8] },
    };
  },

  // ---------------------------------------------------------------- stone
  /** A heavy portal saw: a diamond blade on a crosshead lowers into a block of stone that is already cut into bricks. */
  cutter(g, c) {
    plinth(g, INK.concrete, 0.35);
    for (const z of [-0.5, 0.4]) block(g, 3.6, 0.08, 0.12, INK.steel, 0, 0.39, z, STEEL);
    block(g, 2.0, 0.2, 1.2, INK.iron, 0, 0.53, -0.05);
    block(g, 1.7, 0.95, 1.05, 0xa7a29a, 0, 1.105, -0.05, { round: 0.05 });
    for (const x of [-0.42, 0, 0.42]) block(g, 0.03, 0.5, 1.07, INK.dark, x, 1.34, -0.05);
    block(g, 1.72, 0.03, 1.07, INK.dark, 0, 1.33, -0.05);
    // the portal: two columns and a beam
    for (const s of [-1, 1]) block(g, 0.5, 3.2, 0.7, c.body, s * 1.55, 1.95, -0.45, { ...PANEL(), round: 0.05 });
    block(g, 3.7, 0.55, 0.85, c.accent, 0, 3.6, -0.45, { round: 0.05 });
    hazard(g, 3.3, 0, 3.6, -0.01, 0.16, 10);
    for (const x of [-0.85, 0.85]) rod(g, 0.12, 0.7, c.accent, x, 2.98, -0.45, 'y', undefined, 10);
    // the crosshead: it rides up and down between the columns, the blade spinning on it
    const head = pivot(g, 0, 2.6, -0.2);
    block(head, 2.5, 0.3, 0.55, INK.iron, 0, 0, -0.2);
    for (const x of [-0.85, 0.85]) rod(head, 0.06, 0.6, INK.steel, x, 0.42, -0.25, 'y', STEEL, 8);
    block(head, 0.26, 0.6, 0.22, c.accent, 0, -0.2, 0.15);
    part(head, GEO.vault(0.86, 0.14, 12), c.accent, 0, -0.55, 0.26);
    motor(head, INK.iron, 0.75, 0.32, -0.2, 0.6, 0.18);
    const blade = pivot(head, 0, -0.55, 0.42);
    part(blade, GEO.gear(0.76, 24, 0.04, 0.93), INK.steel, 0, 0, 0, STEEL);
    rod(blade, 0.14, 0.1, INK.hazard, 0, 0, 0, 'z', undefined, 10);
    rig(blade); rig(head);
    pipe(g, [[0.55, 3.33, -0.2], [0.55, 2.7, 0.55], [0.3, 2.55, 0.55]], 0.035, INK.water);
    // the feeder for rubble, and bricks stacked at the right
    block(g, 1.1, 1.0, 1.3, c.body, -2.55, 0.85, -0.25, { ...PANEL(), round: 0.05 });
    block(g, 0.8, 0.1, 0.5, INK.iron, -1.75, 1.05, -0.1).rotation.z = -0.35;
    const bricks = [];
    for (const y of [0.35, 0.585]) for (const z of [-0.75, -0.43]) for (const x of [2.17, 2.8]) bricks.push([x, y, z, 0, 1]);
    pile(g, 'brick', bricks);
    return {
      animate(t, dt, power) {
        blade.rotation.z -= dt * 12;
        head.position.y = power < 0.05 ? 2.6 : 2.6 - 0.42 * tri(t, 1.5);
      },
      fit: { hopper: [-2.55, 1.35, -0.25], feed: 1.0, neon: [0.22, 1.14, 6.0] },
    };
  },

  // ---------------------------------------------------------------- food
  /** A windmill: stone foot, tapered tower, red cap and four lattice sails; sheaves at the left, sacks at the shed door. */
  mill(g, c) {
    const z0 = -0.3, oct = Math.PI / 8;
    rod(g, 1.55, 0.6, 0x9c968c, 0, 0.3, z0, 'y', undefined, 8).rotation.y = oct;
    rod(g, 0.95, 2.9, c.body, 0, 2.05, z0, 'y', undefined, 8, 1.3).rotation.y = oct;
    rod(g, 1.24, 0.1, INK.wood, 0, 1.4, z0, 'y', undefined, 8).rotation.y = oct;
    rod(g, 1.08, 0.08, INK.wood, 0, 2.55, z0, 'y', undefined, 8).rotation.y = oct;
    rod(g, 1.22, 0.12, INK.wood, 0, 3.52, z0, 'y', undefined, 8).rotation.y = oct;
    part(g, GEO.cone(1.2, 1.0, 8), c.accent, 0, 4.08, z0).rotation.y = oct;
    part(g, GEO.arch(0.55, 0.85, 0.08), INK.walnut, 0, 0.6, z0 + 1.19);
    glowing(g, [{ geo: new THREE.BoxGeometry(0.28, 0.38, 0.04), at: [0, 1.85, z0 + 1.08] }, { geo: new THREE.BoxGeometry(0.04, 0.32, 0.26), at: [1.1, 1.75, z0] }], INK.glass, 0xffd27a, 0);
    // the sails
    rod(g, 0.12, 0.5, INK.walnut, 0, 2.95, 0.55, 'z', undefined, 8);
    const hub = pivot(g, 0, 2.95, 0.85);
    rod(hub, 0.18, 0.2, INK.walnut, 0, 0, 0, 'z', undefined, 8);
    for (let i = 0; i < 4; i++) {
      const sail = pivot(hub); sail.rotation.z = i * Math.PI / 2 + Math.PI / 4;
      block(sail, 0.1, 1.68, 0.08, INK.walnut, 0, 0.88, 0.05);
      block(sail, 0.6, 1.3, 0.025, INK.cream, 0.34, 1.02, 0);
      for (const y of [0.37, 0.8, 1.23, 1.66]) block(sail, 0.68, 0.035, 0.05, INK.walnut, 0.34, y, 0.03);
      block(sail, 0.035, 1.32, 0.05, INK.walnut, 0.66, 1.02, 0.03);
    }
    rig(hub);
    // the shed where the flour is bagged, and its chute
    block(g, 1.3, 1.1, 1.3, INK.wood, 2.4, 0.55, -0.35, wood({ upright: true }));
    block(g, 1.5, 0.1, 1.5, c.accent, 2.4, 1.18, -0.35).rotation.z = -0.15;
    block(g, 0.5, 0.75, 0.04, INK.walnut, 2.4, 0.4, 0.31);
    pipe(g, [[1.0, 1.75, -0.35], [1.75, 1.0, -0.35]], 0.09, INK.wood);
    pile(g, 'flour', [[2.0, 0, 0.65, 0.3, 1.15], [2.65, 0, 0.6, -0.2, 1.15], [2.3, 0.345, 0.62, 0.1, 1.15]]);
    pile(g, 'wheat', [[-2.5, 0, 0.1, 0, 1], [-2.2, 0, 0.35, 0, 1], [-2.75, 0, 0.45, 0, 1], [-2.45, 0, 0.7, 0, 1], [-2.1, 0, -0.05, 0, 1]]);
    return {
      animate(t, dt) { hub.rotation.z -= dt * 1.6; },
      fit: { hopper: [-1.7, 0.6, -0.6], feed: 0.6, neon: [0.2, 1.1, 2.6] },
    };
  },
  /** A bakery oven: brick base with a firewood niche, a plastered dome, a glowing arched mouth, a peel with a loaf, a cooling rack. */
  oven(g, c) {
    plinth(g, INK.concrete, 0.15);
    block(g, 3.6, 1.0, 2.2, c.body, -0.4, 0.65, -0.25, { round: 0.06 });
    for (const y of [0.42, 0.72]) block(g, 3.62, 0.03, 2.22, shade(c.body, 0.78), -0.4, y, -0.25);
    const dome = part(g, GEO.dome(1.15, 14), 0xead6b8, -0.4, 1.15, -0.4); dome.scale.set(1.3, 0.92, 0.85);
    block(g, 1.4, 0.95, 0.55, c.accent, -0.4, 1.62, 0.55, { round: 0.04 });
    part(g, GEO.arch(1.0, 0.75, 0.04), INK.brick, -0.4, 1.17, 0.83);
    part(g, GEO.arch(0.8, 0.62, 0.04), INK.dark, -0.4, 1.17, 0.85);
    const fire = new THREE.Mesh(GEO.arch(0.64, 0.48, 0.02), hot(0xff8a1f)); put(g, fire, -0.4, 1.19, 0.885); moving(fire);
    block(g, 1.3, 0.07, 0.32, INK.iron, -0.4, 1.15, 0.98);
    block(g, 1.3, 0.55, 0.04, INK.dark, -0.4, 0.5, 0.86);
    pile(g, 'log', [[-0.4, 0.22, 0.95, 0, 0.85], [-0.4, 0.5, 0.95, 0, 0.85]]);
    gauge(g, 0.08, 1.85, 0.83, 0.1);
    block(g, 0.6, 2.75, 0.6, INK.brick, -1.75, 2.5, -1.05, { round: 0.03 });
    block(g, 0.75, 0.12, 0.75, INK.dark, -1.75, 3.9, -1.05);
    smokes(g, -1.75, 4.2, -1.05, { size: 0.5 });
    // the peel slides a loaf in and out over the ledge
    const peel = pivot(g, -0.4, 1.2, 1.02);
    block(peel, 0.38, 0.02, 0.3, INK.wood, 0, 0, 0);
    rod(peel, 0.022, 1.0, INK.wood, 0.68, 0.01, 0, 'x', undefined, 6);
    rig(peel);
    sample(peel, 'bread', 0.8, 0, 0.01, 0);
    // the cooling rack, with bread on it, and sacks of flour waiting at the left
    frame(g, 1.3, 1.5, 0.7, INK.steel, 2.35, 0.15, -0.55, { post: 0.05, o: STEEL });
    for (const y of [0.6, 1.05]) block(g, 1.25, 0.03, 0.65, INK.steel, 2.35, y, -0.55, STEEL);
    pile(g, 'bread', [[2.05, 0.615, -0.55, 0.2, 1], [2.62, 0.615, -0.5, -0.1, 1], [2.1, 1.065, -0.6, 0, 1], [2.65, 1.065, -0.55, 0.3, 1], [2.35, 1.665, -0.55, 0, 1]]);
    pile(g, 'flour', [[-2.75, 0.15, 0.35, 0.2, 1.1], [-2.7, 0.15, -0.25, -0.3, 1.1], [-2.72, 0.48, 0.05, 0, 1.1]]);
    return {
      animate(t, dt, power) {
        flicker(fire.material, t, power, 0xff8a1f, 0xffc247, 0x8a3a14);
        fire.scale.y = power < 0.1 ? 0.5 : 0.85 + Math.abs(Math.sin(t * 11)) * 0.15;
        peel.position.z = 1.02 - 0.14 * tri(t, 1.6);
      },
      fit: { hopper: [-2.6, 1.15, -0.6], feed: 0.9, neon: [0.4, 0.88, 3.4, -0.4] },
    };
  },

  // ---------------------------------------------------------------- glass
  /** A round glass furnace with three glowing glory holes, a batch feeder, a blowpipe at the marver, and a lehr the panes leave from. */
  kiln(g, c) {
    plinth(g, INK.concrete, 0.3);
    const kx = -0.8, kz = -0.4;
    tank(g, 1.1, 1.9, c.body, kx, 0.3, kz, { band: INK.iron, bands: [0.1, 0.6, 0.97], cap: 0.55, seg: 16 });
    const top = chimney(g, 0.22, 1.2, INK.iron, kx + 0.25, 2.7, kz - 0.35);
    smokes(g, kx + 0.25, top, kz - 0.35, { size: 0.45 });
    const ports = [];
    for (const a of [-0.65, 0, 0.65]) {
      const x = kx + Math.sin(a) * 1.12, z = kz + Math.cos(a) * 1.12;
      part(g, GEO.ring(0.2, 0.06, 12), INK.steel, x, 1.4, z, STEEL).rotation.y = a;
      ports.push({ geo: new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), at: [kx + Math.sin(a) * 1.13, 1.4, kz + Math.cos(a) * 1.13], turn: [Math.PI / 2, a] });
    }
    const melt = hot(0xff9a2a);
    const glow = new THREE.Mesh(portGeometry(ports), melt); put(g, glow); moving(glow);
    // batch feeder with its screw into the furnace
    block(g, 1.0, 0.9, 1.0, c.accent, -2.65, 0.75, 0.0, { ...PANEL(), round: 0.04 });
    pipe(g, [[-2.15, 0.95, 0.0], [-1.75, 0.95, -0.15]], 0.13, INK.steel, STEEL);
    // the marver table and a blowpipe with a gob of glass
    block(g, 0.9, 0.06, 0.5, INK.steel, kx + 0.35, 0.95, 0.95, STEEL);
    frame(g, 0.9, 0.62, 0.5, INK.iron, kx + 0.35, 0.3, 0.95, { post: 0.06, beam: false });
    const pipeArm = pivot(g, kx + 0.95, 1.12, 0.95);
    rod(pipeArm, 0.022, 1.3, INK.steel, 0, 0, 0, 'x', STEEL, 6);
    rig(pipeArm);
    const gob = new THREE.Mesh(GEO.ball(0.12, 10), melt); put(pipeArm, gob, -0.68, 0, 0);
    // the lehr: a long low tunnel where the glass cools, and the panes coming out of it
    block(g, 1.9, 0.5, 1.1, c.accent, 1.55, 0.55, -0.15, { ...PANEL(), round: 0.04 });
    const vault = part(g, GEO.vault(0.55, 1.9, 10), c.accent, 1.55, 0.8, -0.15); vault.rotation.y = Math.PI / 2;
    lit(block(g, 1.6, 0.08, 0.02, 0xffc98a, 1.55, 0.62, 0.41, { map: null }), 0xff8a1f, 0.55);
    for (const x of [2.65, 2.85, 3.05]) rod(g, 0.05, 0.9, INK.steel, x, 0.8, -0.15, 'z', STEEL, 8);
    frame(g, 0.65, 0.5, 0.9, INK.iron, 2.85, 0.3, -0.15, { post: 0.05, beam: false });
    const pane = sample(g, 'glass', 1, 2.5, 0.85, -0.15); moving(pane);
    return {
      animate(t, dt, power) {
        flicker(melt, t, power, 0xff9a2a, 0xffc35a, 0x9a3a12);
        pipeArm.rotation.x += dt * 3;
        pane.position.x = 2.3 + ((t * 0.3) % 1) * 0.8;
      },
      fit: { hopper: [-2.65, 1.2, 0.0], feed: 1.0, neon: [0.2, 1.14, 6.0] },
    };
  },

  // ---------------------------------------------------------------- metal
  /** A blast furnace: a skip hoist carries ore to the top, a hot-blast stove beside it, molten iron runs from the taphole to the moulds. */
  smelter(g, c) {
    plinth(g, INK.concrete, 0.3);
    const fx = -0.3, fz = -0.45;
    rod(g, 1.0, 1.3, c.body, fx, 0.95, fz, 'y', undefined, 14, 1.15);
    part(g, GEO.ring(1.12, 0.1, 16), c.accent, fx, 1.5, fz).rotation.x = Math.PI / 2;
    rod(g, 0.72, 1.7, c.body, fx, 2.45, fz, 'y', undefined, 14, 1.0);
    for (const [y, r] of [[2.0, 0.96], [2.75, 0.84]]) rod(g, r, 0.08, INK.steel, fx, y, fz, 'y', STEEL, 14);
    rod(g, 0.6, 0.35, c.accent, fx, 3.48, fz, 'y', undefined, 12);
    part(g, GEO.cone(0.6, 0.45, 12), c.accent, fx, 3.88, fz);
    pipe(g, [[fx + 0.35, 3.7, fz], [fx + 0.35, 4.3, fz], [2.3, 4.3, -0.95], [2.3, 3.7, -0.95]], 0.13, c.accent);
    tank(g, 0.5, 2.9, 0xb9b3a8, 2.3, 0.3, -0.95, { band: c.accent, bands: [0.25, 0.75], cap: 0.8 });
    pipe(g, [[1.85, 1.0, -0.95], [0.85, 1.5, fz]], 0.12, c.accent);
    smokes(g, fx, 4.2, fz, { size: 0.6 });
    // the skip hoist: two rails up to the top, on trestles
    const a = [-2.8, 0.45], b = [-0.85, 3.55], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (const z of [-0.6, -0.12]) block(g, len, 0.08, 0.08, INK.iron, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z).rotation.z = ang;
    for (const [x, h] of [[-2.25, 1.3], [-1.6, 2.3]]) for (const z of [-0.6, -0.12]) block(g, 0.08, h, 0.08, INK.iron, x, 0.3 + h / 2, z);
    const skip = pivot(g);
    block(skip, 0.42, 0.3, 0.42, INK.iron, 0, 0.1, 0);
    block(skip, 0.36, 0.08, 0.36, 0x7a5c4f, 0, 0.27, 0);
    rig(skip); skip.position.set(a[0], a[1], -0.36);
    // taphole, runner and moulds
    block(g, 0.45, 0.35, 0.3, INK.dark, fx + 0.1, 0.55, 0.62);
    block(g, 2.4, 0.14, 0.34, INK.iron, fx + 1.4, 0.37, 0.78);
    const melt = hot(0xff7a1a);
    const runner = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.03, 0.2), melt); put(g, runner, fx + 1.4, 0.45, 0.78); moving(runner);
    block(g, 0.75, 0.12, 1.0, INK.dark, 2.75, 0.36, 0.55);
    pile(g, 'bar', [[2.75, 0.42, 0.3, Math.PI / 2, 1], [2.75, 0.42, 0.75, Math.PI / 2, 1]]);
    return {
      animate(t, dt, power) {
        const s = tri(t, 0.9);
        skip.position.set(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, -0.36);
        flicker(melt, t, power, 0xff7a1a, 0xffa53a, 0x7a2a10);
      },
      fit: { hopper: [-2.75, 0.3, 0.45], feed: 1.0, neon: [0.2, 1.14, 6.0] },
    };
  },
  /** A smithy: a glowing hearth under a hood, a power hammer with its flywheel, an anvil on a stump, a quench tank. */
  forge(g, c) {
    plinth(g, INK.iron, 0.2);
    block(g, 1.5, 0.85, 1.3, INK.brick, -2.3, 0.625, -0.35, { round: 0.04 });
    block(g, 1.2, 0.08, 1.0, INK.dark, -2.3, 1.09, -0.35);
    const coal = hot(0xff6a1a);
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.7), coal); put(g, coals, -2.3, 1.14, -0.35); moving(coals);
    rod(g, 0.35, 0.75, c.accent, -2.3, 1.95, -0.45, 'y', undefined, 4, 0.85).rotation.y = Math.PI / 4;
    for (const x of [-2.85, -1.75]) rod(g, 0.03, 0.9, INK.iron, x, 1.55, -0.95, 'y', undefined, 5);
    const top = chimney(g, 0.2, 1.6, INK.iron, -2.3, 2.3, -0.45);
    smokes(g, -2.3, top, -0.45, { size: 0.45 });
    // the power hammer
    const hx = 0.5;
    block(g, 1.3, 0.45, 1.1, c.body, hx, 0.425, -0.25, PANEL());
    block(g, 0.75, 2.6, 0.7, c.body, hx, 1.95, -0.7, { ...PANEL(), round: 0.05 });
    block(g, 0.85, 0.75, 1.05, c.body, hx, 3.05, -0.35, { round: 0.05 });
    rod(g, 0.22, 0.6, c.accent, hx, 3.7, -0.15, 'y', undefined, 10);
    for (const s of [-1, 1]) rod(g, 0.04, 1.6, INK.steel, hx + s * 0.27, 1.9, -0.05, 'y', STEEL, 6);
    block(g, 0.5, 0.35, 0.5, INK.iron, hx, 0.82, -0.05);
    block(g, 0.4, 0.1, 0.4, INK.steel, hx, 1.04, -0.05, STEEL);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.1), coal); put(g, bar, hx, 1.12, -0.05); moving(bar);
    const ram = pivot(g, hx, 2.15, -0.05);
    block(ram, 0.42, 0.9, 0.42, c.accent, 0, 0, 0, { round: 0.03 });
    block(ram, 0.38, 0.1, 0.38, INK.steel, 0, -0.5, 0, STEEL);
    rig(ram);
    const fly = wheel(g, 0.68, INK.iron, 1.6, 2.35, -0.6, { spokes: 6, o: {} });
    rod(g, 0.06, 0.75, INK.steel, 1.2, 2.35, -0.6, 'x', STEEL, 8);
    motor(g, c.accent, 1.65, 0.5, -0.95, 0.6, 0.2);
    block(g, 0.05, 1.7, 0.03, INK.rubber, 1.62, 1.45, -0.6).rotation.z = 0.05;
    // the anvil on its stump, with a hammer on it
    rod(g, 0.28, 0.6, INK.walnut, -1.0, 0.5, 0.5, 'y', undefined, 10);
    block(g, 0.3, 0.14, 0.2, INK.dark, -1.0, 0.87, 0.5);
    block(g, 0.6, 0.18, 0.26, INK.dark, -0.98, 1.03, 0.5);
    part(g, GEO.cone(0.12, 0.36, 8), INK.dark, -1.46, 1.05, 0.5).rotation.z = Math.PI / 2;
    block(g, 0.4, 0.04, 0.05, INK.wood, -0.95, 1.14, 0.55).rotation.y = 0.4;
    block(g, 0.08, 0.08, 0.15, INK.steel, -1.12, 1.15, 0.47, STEEL);
    // the quench tank
    block(g, 1.1, 0.65, 0.9, INK.iron, 2.45, 0.525, 0.25);
    block(g, 0.95, 0.03, 0.75, INK.water, 2.45, 0.84, 0.25, { map: null, roughness: 0.1, metalness: 0.2, envMapIntensity: 1 });
    pile(g, 'tool', [[2.45, 0.2, -0.75, 0.3, 1.1]]);
    return {
      animate(t, dt, power) {
        const ph = (t * 1.3) % 1;
        ram.position.y = power < 0.05 ? 2.15 : ph < 0.18 ? 2.15 - ph / 0.18 * 0.46 : 1.69 + (ph - 0.18) / 0.82 * 0.46;
        fly.rotation.z -= dt * 5;
        flicker(coal, t, power, 0xff6a1a, 0xff9a33, 0x7a2a10);
      },
      fit: { hopper: [-2.3, 1.2, 0.5], feed: 0.9, neon: [0.12, 1.14, 6.0] },
    };
  },
  /** A small crucible furnace with a fume hood; the crucible tips gold into bar moulds on the table. */
  goldsmelter(g, c) {
    plinth(g, 0x4d4436, 0.25);
    const ux = -1.15, uz = -0.4;
    rod(g, 0.85, 1.15, c.body, ux, 0.825, uz, 'y', undefined, 14);
    for (const y of [0.45, 1.22]) rod(g, 0.88, 0.08, INK.gold, ux, y, uz, 'y', BRASS, 14);
    rod(g, 0.86, 0.12, INK.iron, ux, 1.46, uz, 'y', undefined, 14);
    const melt = hot(0xffb43a);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 14), melt); put(g, mouth, ux, 1.53, uz); moving(mouth);
    rod(g, 0.62, 0.1, INK.iron, ux, 1.95, uz - 0.75, 'y', undefined, 14).rotation.x = 1.25;
    rod(g, 0.25, 0.5, INK.iron, ux, 2.65, uz, 'y', undefined, 4, 0.75).rotation.y = Math.PI / 4;
    for (const x of [ux - 0.6, ux + 0.6]) rod(g, 0.035, 2.2, INK.iron, x, 1.5, uz - 0.6, 'y', undefined, 5);
    const top = chimney(g, 0.16, 1.2, INK.iron, ux, 2.9, uz);
    smokes(g, ux, top, uz, { size: 0.4 });
    // the pouring frame and its crucible
    const cx = 0.6, cy = 1.3, cz = 0.15;
    for (const x of [cx - 0.38, cx + 0.38]) block(g, 0.12, 1.15, 0.2, c.body, x, 0.825, cz);
    const cup = pivot(g, cx, cy, cz);
    rod(cup, 0.28, 0.5, INK.dark, 0, -0.05, 0, 'y', undefined, 10, 0.21);
    rod(cup, 0.03, 0.66, INK.steel, 0, 0, 0, 'x', STEEL, 6);
    block(cup, 0.12, 0.05, 0.14, INK.dark, 0.3, 0.19, 0);
    rig(cup);
    put(cup, new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 10), melt), 0, 0.2, 0);
    const stream = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), melt); put(g, stream, 1.0, 1.0, cz); moving(stream);
    // the mould table: one mould filling, cooled bars beside it
    block(g, 2.1, 0.08, 0.9, INK.iron, 1.85, 0.75, cz, STEEL);
    frame(g, 2.1, 0.5, 0.9, INK.iron, 1.85, 0.25, cz, { post: 0.08, beam: false });
    block(g, 0.66, 0.04, 0.32, INK.dark, 1.15, 0.81, cz);
    const fill = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.22), melt); put(g, fill, 1.15, 0.82, cz); moving(fill);
    pile(g, 'gold', [[1.85, 0.79, cz - 0.2, 0, 1], [2.5, 0.79, cz - 0.2, 0, 1], [1.85, 0.79, cz + 0.2, 0, 1], [2.5, 0.79, cz + 0.2, 0, 1]]);
    // the ore feeder
    block(g, 0.9, 1.1, 0.9, c.body, -2.6, 0.8, 0.25, { ...PANEL(), round: 0.04 });
    block(g, 0.7, 0.08, 0.3, INK.iron, -2.0, 1.25, 0.0).rotation.z = -0.3;
    return {
      animate(t, dt, power) {
        const tilt = power < 0.05 ? 0 : tri(t, 1.2) * 1.15;
        cup.rotation.z = -tilt; stream.visible = tilt > 0.85;
        flicker(melt, t, power, 0xffb43a, 0xffd25a, 0x8a5a14);
      },
      fit: { hopper: [-2.6, 1.35, 0.25], feed: 1.0, neon: [0.2, 1.14, 6.0] },
    };
  },
  /** An arc furnace with its electrodes, a jib crane swinging a ladle, and a rolling mill pressing a glowing slab into plate. */
  steelmill(g, c) {
    plinth(g, INK.concrete, 0.3);
    const ex = -1.05, ez = -0.35;
    block(g, 1.8, 0.35, 1.6, INK.iron, ex, 0.475, ez);
    rod(g, 1.05, 1.1, c.body, ex, 1.2, ez, 'y', undefined, 16);
    for (const y of [0.95, 1.45]) rod(g, 1.08, 0.08, INK.steel, ex, y, ez, 'y', STEEL, 16);
    const roof = part(g, GEO.dome(1.1, 16), 0x8c949c, ex, 1.75, ez); roof.scale.y = 0.35;
    block(g, 0.35, 0.15, 0.5, INK.iron, ex + 0.65, 1.0, ez + 1.1);
    const melt = hot(0xff8a2a);
    const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 12), melt); put(g, arc, ex, 2.14, ez); moving(arc);
    block(g, 0.4, 3.6, 0.35, c.body, ex, 2.1, -1.32, PANEL());
    const elec = pivot(g, ex, 0, ez);
    for (const [x, z] of [[-0.22, 0.13], [0.22, 0.13], [0, -0.25]]) {
      rod(elec, 0.1, 1.8, INK.dark, x, 2.75, z, 'y', undefined, 8);
      block(elec, 0.12, 0.12, 1.0 + z, c.accent, x, 3.45 + z * 0.3, (z - 0.97) / 2);
    }
    rig(elec);
    const stackTop = chimney(g, 0.2, 1.0, INK.iron, ex + 0.55, 2.0, ez - 0.45);
    smokes(g, ex + 0.55, stackTop, ez - 0.45, { size: 0.5 });
    // the jib crane and its ladle
    rod(g, 0.16, 3.4, c.accent, 0.55, 2.0, -1.05, 'y', undefined, 10);
    const jib = pivot(g, 0.55, 3.55, -1.05);
    block(jib, 0.2, 0.2, 1.75, c.accent, 0, 0, 0.8);
    for (const s of [-1, 1]) rod(jib, 0.015, 1.0, INK.dark, s * 0.2, -0.5, 1.6, 'y', undefined, 4);
    rod(jib, 0.42, 0.65, INK.iron, 0, -1.3, 1.6, 'y', undefined, 12, 0.34);
    part(jib, GEO.ring(0.46, 0.035, 12), INK.iron, 0, -1.0, 1.6);
    rig(jib);
    put(jib, new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.02, 12), melt), 0, -0.97, 1.6);
    // the rolling mill: two housings, two rolls, a glowing slab going in and plate coming out
    for (const z of [-0.85, 0.55]) for (const x of [1.75, 2.45]) block(g, 0.16, 1.9, 0.2, c.accent, x, 1.25, z);
    for (const z of [-0.85, 0.55]) block(g, 0.86, 0.22, 0.24, c.accent, 2.1, 2.25, z);
    const rolls = [0.95, 1.57].map(y => {
      const r = pivot(g, 2.1, y, -0.15);
      rod(r, 0.29, 1.3, INK.steel, 0, 0, 0, 'z', STEEL, 14);
      block(r, 0.59, 0.05, 1.32, INK.iron, 0, 0, 0);
      return rig(r);
    });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.8), melt); put(g, slab, 1.25, 1.26, -0.15); moving(slab);
    block(g, 0.95, 0.08, 0.9, INK.iron, 1.25, 1.19, -0.15);
    block(g, 0.6, 0.08, 0.9, INK.iron, 2.85, 1.19, -0.15);
    frame(g, 0.6, 0.9, 0.9, INK.iron, 2.85, 0.3, -0.15, { post: 0.07, beam: false });
    frame(g, 0.95, 0.9, 0.9, INK.iron, 1.25, 0.3, -0.15, { post: 0.07, beam: false });
    pile(g, 'steel', [[2.85, 1.23, -0.15, Math.PI / 2, 1]]);
    return {
      animate(t, dt, power) {
        jib.rotation.y = 0.4 + 0.6 * Math.sin(t * 0.6);
        rolls[0].rotation.z -= dt * 4; rolls[1].rotation.z += dt * 4;
        elec.position.y = power < 0.05 ? 0.08 : Math.sin(t * 2.3) * 0.04;
        flicker(melt, t, power, 0xff8a2a, 0xffc04a, 0x7a2a10);
      },
      fit: { hopper: [-2.6, 0.3, -0.9], feed: 1.0, neon: [0.2, 1.14, 6.0] },
    };
  },

  // ---------------------------------------------------------------- jewellery
  /** A jeweller's atelier: a lit display cabinet, a bench with a magnifier lamp, a polishing wheel and a ring under a glass bell. */
  jeweler(g, c) {
    plinth(g, shade(c.body, 0.86), 0.15);
    block(g, 6.3, 0.04, 0.04, INK.gold, 0, 0.15, 1.15, BRASS);
    block(g, 5.0, 2.3, 0.5, c.body, -0.1, 1.3, -1.15, { round: 0.05 });
    block(g, 5.2, 0.2, 0.62, c.accent, -0.1, 2.55, -1.15);
    block(g, 5.25, 0.05, 0.66, INK.gold, -0.1, 2.67, -1.15, BRASS);
    const shelf = [];
    for (const x of [-1.7, -0.1, 1.5]) {
      block(g, 1.25, 0.85, 0.03, shade(c.accent, 0.55), x, 1.75, -0.885);
      shelf.push([x - 0.25, 1.6, -0.84, 0, 1.3, -Math.PI / 2], [x + 0.25, 1.6, -0.84, 0, 1.3, -Math.PI / 2]);
    }
    pile(g, 'ring', shelf);
    lit(block(g, 4.6, 0.05, 0.05, 0xfff4d6, -0.1, 2.25, -0.86, { map: null }), 0xfff0c8, 0.6);
    // the bench: walnut top, drawers with brass knobs, a pin and a leather tray
    block(g, 2.3, 0.1, 0.95, INK.walnut, -0.95, 1.0, 0.2, wood({ rx: 2 }));
    frame(g, 2.2, 0.85, 0.85, INK.walnut, -0.95, 0.15, 0.2, { post: 0.08, beam: false });
    block(g, 0.6, 0.6, 0.75, INK.walnut, -1.8, 0.6, 0.15);
    for (const y of [0.45, 0.75]) rod(g, 0.035, 0.04, INK.gold, -1.8, y, 0.54, 'z', BRASS, 8);
    block(g, 0.8, 0.02, 0.5, 0x5a3a2a, -0.85, 0.78, 0.5);
    block(g, 0.25, 0.04, 0.12, INK.wood, -0.95, 1.07, 0.7);
    rod(g, 0.035, 0.4, INK.steel, -0.45, 1.1, 0.35, 'x', STEEL, 8, 0.012);
    sample(g, 'ring', 1, -0.5, 1.05, 0.35);
    pipe(g, [[-0.3, 1.05, -0.2], [-0.3, 1.95, -0.2], [-0.75, 1.88, 0.35]], 0.03, INK.iron);
    part(g, GEO.ring(0.18, 0.04, 16), c.accent, -0.75, 1.82, 0.4).rotation.x = Math.PI / 2 - 0.2;
    lit(rod(g, 0.15, 0.02, 0xfff7e0, -0.75, 1.81, 0.4, 'y', { map: null }, 14), 0xfff3d6, 0.5);
    // the polishing lathe, its buff facing the room
    rod(g, 0.35, 0.06, INK.iron, 1.55, 0.18, 0.0, 'y', undefined, 12);
    rod(g, 0.12, 0.85, INK.iron, 1.55, 0.6, 0.0, 'y', undefined, 8);
    rod(g, 0.24, 0.6, c.accent, 1.55, 1.15, -0.2, 'z', undefined, 14);
    rod(g, 0.03, 0.45, INK.steel, 1.55, 1.15, 0.28, 'z', STEEL, 6);
    const buff = pivot(g, 1.55, 1.15, 0.47);
    rod(buff, 0.36, 0.13, INK.white, 0, 0, 0, 'z', undefined, 16);
    part(buff, GEO.ring(0.24, 0.015, 16), 0xd8d0c0, 0, 0, 0.066);
    block(buff, 0.05, 0.62, 0.012, 0xc9a23a, 0, 0, 0.07);
    rig(buff);
    // a ring on a cushion, under a glass bell
    rod(g, 0.12, 0.6, INK.gold, 2.6, 0.45, 0.55, 'y', BRASS, 10);
    block(g, 0.4, 0.15, 0.4, c.accent, 2.6, 0.82, 0.55);
    sample(g, 'ring', 1.1, 2.6, 0.9, 0.55);
    rod(g, 0.3, 0.4, INK.glass, 2.6, 1.1, 0.55, 'y', GLASS, 14);
    part(g, GEO.dome(0.3, 14), INK.glass, 2.6, 1.3, 0.55, GLASS);
    return {
      animate(t, dt) { buff.rotation.z -= dt * 14; },
      fit: { hopper: [-2.6, 1.0, 0.4], feed: 1.0, neon: [0.3, 1.14, 6.0] },
    };
  },
  /** A gem-cutting bench: a trim saw for the rough, a faceting lap with its head and water drip, and a light box for the gems. */
  gemcutter(g, c) {
    plinth(g, shade(c.body, 0.55), 0.2);
    block(g, 1.5, 0.85, 1.25, c.body, 0.1, 0.625, -0.15, { ...PANEL(), round: 0.05 });
    rod(g, 0.66, 0.1, INK.iron, 0.1, 1.1, -0.05, 'y', undefined, 16);
    const lap = pivot(g, 0.1, 1.17, -0.05);
    rod(lap, 0.56, 0.04, INK.steel, 0, 0, 0, 'y', STEEL, 20);
    rod(lap, 0.36, 0.045, INK.copper, 0, 0, 0, 'y', BRASS, 16);
    block(lap, 1.06, 0.05, 0.06, INK.dark, 0, 0.005, 0);
    rig(lap);
    rod(g, 0.06, 1.0, INK.steel, 0.1, 1.55, -0.68, 'y', STEEL, 8);
    const sweep = pivot(g, 0.1, 1.85, -0.68);
    block(sweep, 0.1, 0.1, 0.72, c.accent, 0, 0, 0.32);
    rod(sweep, 0.035, 0.5, INK.steel, 0, -0.25, 0.62, 'y', STEEL, 6);
    part(sweep, GEO.ring(0.12, 0.03, 12), INK.gold, 0, 0, 0.7, BRASS);
    rig(sweep);
    const held = sample(sweep, 'gem', 0.45, 0, -0.4, 0.62); held.rotation.x = Math.PI; held.position.y = -0.38;
    rod(g, 0.1, 0.25, INK.water, 0.8, 1.95, -0.6, 'y', undefined, 10);
    rod(g, 0.03, 0.9, INK.steel, 0.8, 1.4, -0.6, 'y', STEEL, 6);
    pipe(g, [[0.8, 1.83, -0.6], [0.8, 1.62, -0.6], [0.45, 1.42, -0.2]], 0.015, INK.water);
    // the trim saw and the crystal bin
    block(g, 0.9, 0.8, 0.8, c.accent, -1.6, 0.6, -0.1, PANEL());
    part(g, GEO.vault(0.4, 0.22, 10), c.body, -1.6, 1.0, -0.18);
    const saw = pivot(g, -1.6, 1.02, 0.02);
    part(saw, GEO.blade(0.33, 20, 0.03), INK.steel, 0, 0, 0, STEEL);
    rod(saw, 0.07, 0.06, INK.dark, 0, 0, 0, 'z', undefined, 8);
    rig(saw);
    pile(g, 'crystal', [[-1.9, 1.0, 0.12, 0.4, 0.55]]);
    block(g, 0.8, 1.0, 0.8, INK.iron, -2.65, 0.7, -0.15, PANEL());
    // the light box with finished gems, and a lamp over it
    block(g, 1.0, 0.75, 0.8, INK.white, 2.15, 0.575, 0.0, { round: 0.04 });
    lit(block(g, 0.85, 0.03, 0.65, 0xf4f8ff, 2.15, 0.965, 0.0, { map: null }), 0xdff2ff, 0.5);
    pile(g, 'gem', [[1.92, 0.98, -0.1, 0, 0.8], [2.32, 0.98, 0.15, 0.5, 0.8], [2.38, 0.98, -0.2, 1, 0.8]]);
    pipe(g, [[2.6, 0.95, -0.35], [2.6, 1.9, -0.35], [2.25, 1.75, -0.05]], 0.025, INK.iron);
    part(g, GEO.cone(0.16, 0.16, 10), c.accent, 2.25, 1.7, -0.05);
    return {
      animate(t, dt) {
        lap.rotation.y -= dt * 14; saw.rotation.z -= dt * 14;
        sweep.rotation.y = 0.3 * Math.sin(t * 1.2);
      },
      fit: { hopper: [-2.65, 1.2, -0.15], feed: 1.0, neon: [0.22, 1.14, 6.0] },
    };
  },

  // ---------------------------------------------------------------- energy and chemistry
  /** A refinery: a heater, a tall distillation column with platforms, a condenser, two storage tanks, a flare and a valve wheel. */
  refinery(g, c) {
    plinth(g, INK.concrete, 0.25);
    const cx = -1.45, cz = -0.75;
    rod(g, 0.5, 0.5, INK.iron, cx, 0.5, cz, 'y', undefined, 12);
    rod(g, 0.42, 3.8, c.body, cx, 2.15, cz, 'y', undefined, 12);
    part(g, GEO.dome(0.42, 12), c.body, cx, 4.05, cz).scale.y = 0.6;
    for (const y of [1.25, 2.25, 3.25]) rod(g, 0.44, 0.1, c.accent, cx, y, cz, 'y', undefined, 12);
    for (const y of [1.75, 2.75, 3.75]) rod(g, 0.64, 0.05, INK.iron, cx, y, cz, 'y', undefined, 12);
    for (const s of [-1, 1]) block(g, 0.03, 3.4, 0.03, INK.iron, cx + s * 0.12, 2.0, cz + 0.47);
    for (let y = 0.6; y < 3.7; y += 0.4) block(g, 0.24, 0.025, 0.025, INK.iron, cx, y, cz + 0.47);
    // the heater with its firebox, feeding the column
    block(g, 1.0, 1.0, 0.9, c.accent, -2.55, 0.75, 0.25, PANEL());
    const fire = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.02), hot(0xff8a1f)); put(g, fire, -2.55, 0.6, 0.71); moving(fire);
    const heatTop = chimney(g, 0.12, 1.1, INK.iron, -2.8, 1.25, 0.05);
    smokes(g, -2.8, heatTop, 0.05, { size: 0.35, color: 0x9a9fa6 });
    pipe(g, [[-2.05, 0.9, 0.25], [cx, 0.9, 0.25], [cx, 0.9, cz + 0.45]], 0.09, c.accent);
    // the vapour line, the condenser and the tanks
    pipe(g, [[cx, 4.2, cz], [cx, 4.38, cz], [-0.35, 4.38, cz], [-0.35, 2.9, cz]], 0.09, INK.steel, STEEL);
    rod(g, 0.3, 1.5, INK.white, 0.35, 2.9, cz, 'x', undefined, 12);
    frame(g, 1.2, 2.6, 0.5, INK.iron, 0.35, 0.25, cz, { post: 0.07 });
    tank(g, 0.7, 1.3, c.body, 1.5, 0.25, -0.5, { band: c.accent, bands: [0.75], cap: 0.35 });
    tank(g, 0.52, 1.0, c.body, 2.55, 0.25, 0.3, { band: c.accent, bands: [0.7], cap: 0.35 });
    pipe(g, [[1.1, 2.9, cz], [1.5, 2.9, cz], [1.5, 1.75, -0.5]], 0.08, INK.steel, STEEL);
    pipe(g, [[1.5, 0.6, 0.2], [2.05, 0.6, 0.2]], 0.07, c.accent);
    const valve = wheel(g, 0.17, 0xe0452f, 1.75, 0.6, 0.34, { spokes: 3, tube: 0.03, hub: 0.04, o: {} });
    rod(g, 0.025, 0.14, INK.steel, 1.75, 0.6, 0.26, 'z', STEEL, 6);
    // the pump and the flare
    motor(g, c.accent, -0.35, 0.5, 0.6, 0.55, 0.18);
    rod(g, 0.07, 3.9, INK.iron, 0.75, 2.2, -1.32, 'y', undefined, 8);
    const flame = new THREE.Mesh(GEO.cone(0.16, 0.5, 6), hot(0xff8a1f)); put(g, flame, 0.75, 4.4, -1.32); moving(flame);
    flame.visible = false;
    smokes(g, cx, 4.5, cz, { size: 0.35, color: 0xf4f4f4 });
    return {
      animate(t, dt, power) {
        valve.rotation.z += dt * 4;
        flame.visible = power > 0.1; flame.scale.y = 0.8 + Math.abs(Math.sin(t * 13)) * 0.6;
        flicker(fire.material, t, power, 0xff8a1f, 0xffc247, 0x8a3a14);
      },
      fit: { hopper: [-2.55, 1.25, -0.6], feed: 0.9, neon: [0.2, 1.14, 6.0] },
    };
  },
  /** A generating set: a fuel tank, a turbine housing with cooling rings, an alternator with a spinning flywheel, a transformer and a rack of cells. */
  generator(g, c) {
    plinth(g, INK.iron, 0.3);
    tank(g, 0.45, 1.2, 0xe0452f, -2.6, 0.3, 0.35, { band: INK.iron, bands: [0.2, 0.8], cap: 0.4 });
    pipe(g, [[-2.15, 0.6, 0.35], [-1.9, 0.6, 0.35], [-1.9, 0.9, -0.3]], 0.05, INK.iron);
    rod(g, 0.72, 2.2, c.body, -0.5, 1.2, -0.3, 'x', undefined, 16);
    part(g, GEO.cone(0.72, 0.6, 16), c.body, -1.9, 1.2, -0.3).rotation.z = Math.PI / 2;
    part(g, GEO.ring(0.35, 0.05, 14), INK.steel, -2.2, 1.2, -0.3, STEEL).rotation.y = Math.PI / 2;
    for (const x of [-1.35, -0.95, -0.55, -0.15]) rod(g, 0.76, 0.06, INK.steel, x, 1.2, -0.3, 'x', STEEL, 16);
    lit(rod(g, 0.735, 0.14, c.accent, 0.38, 1.2, -0.3, 'x', undefined, 16), c.accent, 0.5);
    for (const x of [-1.2, 0.2]) block(g, 0.3, 0.6, 1.2, INK.iron, x, 0.6, -0.3);
    const top = chimney(g, 0.18, 1.6, INK.iron, -0.9, 1.7, -0.8);
    smokes(g, -0.9, top, -0.8, { size: 0.4, color: 0x9a9fa6 });
    rod(g, 0.25, 0.3, INK.steel, 0.75, 1.2, -0.3, 'x', STEEL, 12);
    // alternator and flywheel
    block(g, 1.1, 1.3, 1.0, c.body, 1.45, 0.95, -0.65, { ...PANEL(), round: 0.05 });
    rod(g, 0.08, 0.32, INK.steel, 1.45, 1.15, -0.05, 'z', STEEL, 8);
    const fly = wheel(g, 0.75, c.accent, 1.45, 1.15, 0.14, { spokes: 6, o: {} });
    // the transformer, its cables and the charging rack
    block(g, 0.7, 1.1, 0.7, INK.iron, 2.55, 0.85, -1.0, PANEL());
    for (const x of [2.35, 2.55, 2.75]) rod(g, 0.06, 0.35, 0xb8693a, x, 1.58, -1.0, 'y', undefined, 8, 0.09);
    pipe(g, [[1.75, 1.6, -0.9], [2.0, 1.95, -0.95], [2.35, 1.75, -1.0]], 0.03, INK.dark);
    pipe(g, [[2.75, 1.75, -1.0], [2.95, 1.7, -0.3], [2.95, 1.05, 0.5]], 0.03, INK.dark);
    block(g, 0.85, 0.7, 0.55, INK.dark, 2.7, 0.65, 0.65);
    pile(g, 'cell', [[2.45, 1.0, 0.65, 0, 0.8], [2.72, 1.0, 0.65, 0, 0.8], [2.99, 1.0, 0.65, 0, 0.8]]);
    lit(block(g, 0.65, 0.07, 0.02, c.accent, 2.7, 0.85, 0.93, { map: null }), c.accent, 0.6);
    return {
      animate(t, dt) { fly.rotation.z -= dt * 7; },
      fit: { hopper: [-2.6, 1.6, -0.6], feed: 1.0, neon: [0.25, 1.14, 6.0] },
    };
  },
  /** A chemical reactor: a pressure vessel on legs with a glowing window onto its core, an agitator on top, coolant loops and a fan cooler. */
  reactor(g, c) {
    plinth(g, INK.concrete, 0.25);
    const vx = -0.55, vz = -0.35;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(g, 0.14, 0.85, 0.14, INK.iron, vx + sx * 0.6, 0.65, vz + sz * 0.6);
    rod(g, 0.95, 2.0, c.body, vx, 2.05, vz, 'y', undefined, 16);
    const foot = part(g, GEO.dome(0.95, 16), c.body, vx, 1.05, vz); foot.scale.y = -0.45;
    part(g, GEO.dome(0.95, 16), c.body, vx, 3.05, vz).scale.y = 0.45;
    for (const y of [1.4, 2.75]) rod(g, 0.98, 0.12, c.accent, vx, y, vz, 'y', undefined, 16);
    part(g, GEO.ring(0.36, 0.07, 16), INK.steel, vx, 2.05, vz + 0.95, STEEL);
    const core = hot(c.accent);
    const window_ = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 16).rotateX(Math.PI / 2), core); put(g, window_, vx, 2.05, vz + 0.94); moving(window_);
    block(g, 0.5, 0.35, 0.5, INK.iron, vx, 3.55, vz);
    rod(g, 0.2, 0.55, c.accent, vx, 4.0, vz, 'y', undefined, 12);
    const fan = pivot(g, vx, 4.3, vz);
    rod(fan, 0.2, 0.03, INK.iron, 0, 0, 0, 'y', undefined, 12);
    block(fan, 0.38, 0.035, 0.07, INK.hazard, 0, 0.02, 0);
    rig(fan);
    rod(g, 0.06, 0.45, INK.steel, vx + 0.55, 3.45, vz - 0.2, 'y', STEEL, 6);
    smokes(g, vx + 0.55, 3.75, vz - 0.2, { size: 0.3, color: 0xf4f4f4 });
    // coolant loops to the heat exchanger, and the fan cooler
    rod(g, 0.35, 1.6, INK.white, 1.3, 1.55, -0.95, 'x', undefined, 12);
    for (const x of [0.75, 1.85]) block(g, 0.2, 1.1, 0.6, INK.iron, x, 0.8, -0.95);
    pipe(g, [[vx + 0.9, 2.5, vz], [0.85, 2.5, vz], [0.85, 2.5, -0.95], [0.85, 1.85, -0.95]], 0.08, INK.water);
    pipe(g, [[vx + 0.92, 1.6, vz + 0.2], [1.95, 1.6, vz + 0.2], [1.95, 1.6, -0.95]], 0.08, INK.water);
    block(g, 1.1, 0.95, 1.0, INK.white, 2.3, 0.725, 0.4, PANEL());
    part(g, GEO.ring(0.4, 0.05, 16), INK.dark, 2.3, 1.23, 0.4).rotation.x = Math.PI / 2;
    const cool = pivot(g, 2.3, 1.24, 0.4);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3;
      block(cool, 0.12, 0.02, 0.36, INK.iron, Math.sin(a) * 0.18, 0, Math.cos(a) * 0.18).rotation.y = a;
    }
    rod(cool, 0.07, 0.06, INK.dark, 0, 0, 0, 'y', undefined, 8);
    rig(cool);
    // the feeds from the left: fuel in a red pipe, power in a cable
    pipe(g, [[-2.85, 0.75, -0.3], [-2.0, 0.75, -0.3], [-2.0, 1.6, -0.3], [vx - 0.9, 1.6, -0.3]], 0.07, 0xe0452f);
    pipe(g, [[-2.85, 0.55, 0.3], [vx - 0.6, 0.55, 0.3], [vx - 0.6, 1.1, 0.0]], 0.035, INK.dark);
    pile(g, 'plastic', [[0.7, 0.25, 0.8, 0.2, 1], [1.2, 0.25, 0.85, -0.2, 1]]);
    cabinet(g, INK.white, -2.35, 0.25, -1.05, { screen: 0xffd0ea, glow: c.accent });
    return {
      animate(t, dt, power) {
        fan.rotation.y += dt * 8; cool.rotation.y += dt * 12;
        core.color.setHex(c.accent).multiplyScalar(power < 0.1 ? 0.4 : 0.75 + 0.25 * Math.sin(t * 4));
      },
      fit: { hopper: [-2.4, 1.3, 0.4], feed: 0.9, neon: [0.2, 1.14, 6.0] },
    };
  },

  // ---------------------------------------------------------------- advanced manufacturing
  /** A pick-and-place line: boards on rails under a gantry whose head dips to place parts, reels of parts behind, a robot arm unloading. */
  assembly(g, c) {
    plinth(g, shade(c.body, 1.35), 0.15);
    block(g, 4.2, 0.95, 2.0, c.body, 0.1, 0.625, -0.2, { ...PANEL(), round: 0.05 });
    block(g, 4.0, 0.04, 1.8, 0xd5dbe0, 0.1, 1.12, -0.2);
    for (const z of [-0.62, 0.22]) block(g, 4.2, 0.06, 0.08, INK.steel, 0.1, 1.17, z, STEEL);
    pile(g, 'circuit', [[-1.25, 1.14, -0.2, 0, 1.7], [0.05, 1.14, -0.2, 0, 1.7], [1.35, 1.14, -0.2, 0, 1.7]]);
    frame(g, 3.9, 1.25, 1.75, INK.steel, 0.1, 1.12, -0.2, { post: 0.12, o: STEEL });
    const bridge = pivot(g, 0, 2.25, -0.2);
    block(bridge, 0.22, 0.18, 1.75, c.accent, 0, 0, 0);
    const head = pivot(bridge, 0, -0.2, 0);
    block(head, 0.34, 0.36, 0.3, INK.white, 0, -0.05, 0, { round: 0.03 });
    const nozzles = pivot(head, 0, -0.25, 0);
    for (const x of [-0.08, 0.08]) rod(nozzles, 0.025, 0.32, INK.steel, x, -0.14, 0, 'y', STEEL, 6);
    rig(nozzles); rig(head); rig(bridge);
    // reels of parts at the back, each feeding a strip toward the bed
    [[-1.6, 0x58e06a], [-1.05, 0x3aa0ff], [-0.5, 0xffb020], [0.05, INK.white], [0.6, 0x58e06a]].forEach(([x, tape]) => {
      rod(g, 0.38, 0.06, INK.dark, x, 1.56, -1.12, 'z', undefined, 14);
      rod(g, 0.29, 0.07, tape, x, 1.56, -1.12, 'z', undefined, 14);
      block(g, 0.06, 0.35, 0.25, INK.steel, x, 1.28, -0.95, STEEL);
    });
    // the screen, the stack light, and the arm that takes finished boards off
    block(g, 1.0, 0.55, 0.02, INK.dark, 1.4, 0.72, 0.805);
    lit(block(g, 0.9, 0.45, 0.02, 0x7fffc0, 1.4, 0.72, 0.815, { map: null }), c.accent, 0.5);
    rod(g, 0.03, 0.5, INK.iron, -1.85, 2.6, 0.62, 'y', undefined, 6);
    rod(g, 0.07, 0.12, 0xff5a52, -1.85, 2.95, 0.62, 'y', undefined, 10);
    rod(g, 0.07, 0.12, 0xffc233, -1.85, 3.07, 0.62, 'y', undefined, 10);
    lit(rod(g, 0.07, 0.12, 0x58e06a, -1.85, 3.19, 0.62, 'y', undefined, 10), 0x39e36a, 0.6);
    const arm = robotArm(g, 0xe8eef2, 2.65, 0.15, -0.65, { upper: 0.85, fore: 0.75, tool: 'grip', face: 0.15 });
    return {
      animate(t, dt, power) {
        bridge.position.x = 1.15 * Math.sin(t * 1.1);
        head.position.z = 0.5 * Math.sin(t * 2.3);
        nozzles.position.y = -0.25 - (power > 0.05 ? 0.16 * Math.max(0, Math.sin(t * 7)) : 0);
        const k = tri(t, 1.4);
        arm.pose(0.2 * Math.sin(t * 0.7), 0.35 + 0.45 * k, 0.9 + 0.35 * k, 0.4);
      },
      fit: { hopper: [-2.4, 1.15, -0.6], feed: 1.0, neon: [0.62, 0.82, 4.0, 0.1] },
    };
  },
  /** An engine assembly cell: an engine block turning on a jig, a robot arm driving bolts, a hoist bringing a cylinder head. */
  engineline(g, c) {
    plinth(g, 0x5b636c, 0.18);
    hazard(g, 6.2, 0, 0.09, 1.19, 0.14, 18);
    rod(g, 0.55, 0.5, INK.iron, 0, 0.43, -0.1, 'y', undefined, 12, 0.65);
    const jig = pivot(g, 0, 0.68, -0.1);
    rod(jig, 0.6, 0.08, c.accent, 0, 0.04, 0, 'y', undefined, 16);
    for (let i = 0; i < 4; i++) block(jig, 0.12, 0.2, 0.12, INK.steel, Math.sin(i * TAU / 4 + 0.78) * 0.5, 0.18, Math.cos(i * TAU / 4 + 0.78) * 0.5, STEEL);
    rig(jig);
    sample(jig, 'engine', 2.6, 0, 0.08, 0);
    const arm = robotArm(g, c.accent, 1.8, 0.18, -0.55, { upper: 1.05, fore: 0.9, tool: 'drive', face: 0.25 });
    // the A-frame hoist and its trolley
    for (const x of [-2.75, 2.75]) {
      block(g, 0.15, 3.4, 0.15, c.body, x, 1.85, -0.75).rotation.x = 0.3;
      block(g, 0.15, 3.4, 0.15, c.body, x, 1.85, 0.25).rotation.x = -0.3;
    }
    block(g, 5.8, 0.28, 0.25, c.body, 0, 3.45, -0.25);
    hazard(g, 5.4, 0, 3.45, -0.11, 0.12, 16);
    const trolley = pivot(g, 0, 3.2, -0.25);
    block(trolley, 0.4, 0.22, 0.35, INK.hazard, 0, 0, 0);
    rod(trolley, 0.015, 0.9, INK.dark, 0, -0.55, 0, 'y', undefined, 4);
    block(trolley, 0.55, 0.2, 0.32, 0x8d99a6, 0, -1.1, 0);
    rig(trolley);
    // the parts rack and the tool chest
    frame(g, 1.0, 1.4, 0.55, INK.iron, -2.45, 0.18, -0.85, { post: 0.06 });
    for (const y of [0.6, 1.05]) block(g, 0.95, 0.04, 0.5, INK.iron, -2.45, y, -0.85);
    for (const x of [-2.8, -2.6, -2.4, -2.2]) rod(g, 0.07, 0.2, INK.steel, x, 0.72, -0.85, 'y', STEEL, 8);
    pile(g, 'steel', [[-2.45, 1.07, -0.85, 0, 1.2]]);
    block(g, 0.7, 0.8, 0.5, 0xd63a2f, -1.6, 0.58, 0.75, { round: 0.03 });
    for (const y of [0.4, 0.62, 0.84]) block(g, 0.6, 0.02, 0.02, INK.dark, -1.6, y, 1.01);
    return {
      animate(t, dt) {
        jig.rotation.y += dt * 0.5;
        trolley.position.x = 1.6 * Math.sin(t * 0.5);
        const k = tri(t, 1.6);
        arm.pose(0.15 * Math.sin(t * 0.8), 0.55 + 0.3 * k, 1.1 + 0.25 * k, 0.5);
      },
      fit: { hopper: [-2.4, 1.3, 0.4], feed: 1.0, neon: [3.25, -0.11, 5.4] },
    };
  },
  /** A body shop: a car on its dolly under a welding gantry, two torches dipping, a robot welding the far side. */
  carline(g, c) {
    plinth(g, 0x4a525b, 0.18);
    for (const z of [-0.55, 0.35]) block(g, 5.6, 0.08, 0.14, INK.steel, 0, 0.22, z, STEEL);
    block(g, 3.0, 0.2, 1.3, INK.dark, 0, 0.36, -0.1);
    sample(g, 'car', 3.4, 0, 0.46, -0.1);
    frame(g, 4.4, 2.6, 2.3, c.accent, 0, 0.18, -0.15, { post: 0.18 });
    const bridge = pivot(g, 0, 2.6, -0.15);
    block(bridge, 0.3, 0.3, 2.3, INK.hazard, 0, 0, 0);
    rig(bridge);
    const torches = [-0.55, 0.35].map(z => {
      const h = pivot(bridge, 0, -0.15, z);
      rod(h, 0.08, 0.6, INK.steel, 0, -0.3, 0, 'y', STEEL, 8);
      rod(h, 0.03, 0.25, INK.copper, 0, -0.7, 0, 'y', STEEL, 6, 0.06);
      return rig(h);
    });
    glowing(g, [-2.11, 2.11].map(x => ({ geo: new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), at: [x, 2.88, 0.91] })), 0xffb020, 0xffa000, 0.6);
    const arm = robotArm(g, 0xe9edf1, 0.95, 0.18, -1.1, { upper: 0.95, fore: 0.8, tool: 'weld', face: -Math.PI / 2 });
    return {
      animate(t, dt, power) {
        bridge.position.x = 1.0 * Math.sin(t * 0.9);
        for (let i = 0; i < torches.length; i++) torches[i].position.y = -0.15 - (power > 0.05 ? 0.22 * Math.max(0, Math.sin(t * 5 + i * 2)) : 0);
        const k = tri(t, 1.3);
        arm.pose(0.35 * Math.sin(t * 0.9), 0.55 + 0.25 * k, 0.95 + 0.2 * k, 0.5);
      },
      fit: { hopper: [-2.4, 1.3, 0.4], feed: 1.0, neon: [2.55, 1.0, 4.0] },
    };
  },
  /** A robot assembly cell: a robot turning on a table between two arms, under a lit scanner arch, with trays of circuits and gems. */
  robotline(g, c) {
    plinth(g, 0xd5dce4, 0.18);
    block(g, 6.3, 0.012, 0.12, c.accent, 0, 0.186, 1.0);
    rod(g, 0.85, 0.32, INK.iron, 0, 0.34, -0.1, 'y', undefined, 16);
    const table = pivot(g, 0, 0.5, -0.1);
    rod(table, 0.8, 0.06, c.accent, 0, 0.03, 0, 'y', undefined, 16);
    block(table, 0.18, 0.065, 0.3, INK.white, 0, 0.035, 0.6);
    rig(table);
    sample(table, 'robot', 3.0, 0, 0.06, 0);
    const left = robotArm(g, c.accent, -1.85, 0.18, -0.45, { upper: 0.95, fore: 0.8, tool: 'grip', face: -0.19 });
    const right = robotArm(g, c.accent, 1.85, 0.18, -0.45, { upper: 0.95, fore: 0.8, tool: 'drive', face: 0.19 });
    // the scanner arch behind the table
    part(g, new THREE.TorusGeometry(1.25, 0.08, 6, 20, Math.PI), INK.white, 0, 1.0, -0.95);
    for (const x of [-1.25, 1.25]) rod(g, 0.08, 0.82, INK.white, x, 0.59, -0.95, 'y', undefined, 8);
    glowing(g, [{ geo: new THREE.TorusGeometry(1.25, 0.035, 4, 20, Math.PI), at: [0, 1.0, -0.86] }], 0xbfe6ff, c.accent, 0.5);
    // trays: circuits at the left, gems on a light box at the right
    block(g, 0.9, 0.7, 0.6, INK.iron, -2.55, 0.53, -1.05);
    pile(g, 'circuit', [[-2.55, 0.92, -1.05, 0, 1], [-2.55, 1.0, -1.05, 0.1, 1]]);
    block(g, 0.8, 0.7, 0.6, INK.iron, 2.6, 0.53, 0.55);
    lit(block(g, 0.7, 0.03, 0.5, 0xeaf6ff, 2.6, 0.9, 0.55, { map: null }), 0xbfe6ff, 0.5);
    pile(g, 'gem', [[2.45, 0.915, 0.45, 0, 0.7], [2.75, 0.915, 0.65, 0.6, 0.7]]);
    return {
      animate(t, dt) {
        table.rotation.y += dt * 0.7;
        const a = tri(t, 1.7), b = tri(t + 1.1, 1.7);
        left.pose(0.25 * Math.sin(t * 0.8), -(0.45 + 0.3 * a), -(0.95 + 0.3 * a), -0.5);
        right.pose(0.25 * Math.sin(t * 0.8 + 1), 0.45 + 0.3 * b, 0.95 + 0.3 * b, 0.5);
      },
      fit: { hopper: [-2.4, 1.3, 0.4], feed: 1.0, neon: [0.12, 1.19, 6.0] },
    };
  },
  /** A gift-wrapping counter: a roll of paper unwinding over the counter, a gift turning as it is wrapped, a ribbon spool, a shelf of finished gifts. */
  giftcounter(g, c) {
    plinth(g, INK.wood, 0.15, wood({ rx: 3 }));
    block(g, 4.2, 0.9, 1.3, c.body, -0.1, 0.6, -0.05, { round: 0.05 });
    block(g, 4.0, 0.6, 0.03, c.accent, -0.1, 0.6, 0.61);
    block(g, 4.25, 0.05, 1.35, 0xf6f2ea, -0.1, 1.075, -0.05);
    block(g, 4.25, 0.05, 0.05, INK.gold, -0.1, 1.06, 0.63, BRASS);
    for (const x of [-1.45, 0.65]) block(g, 0.08, 0.6, 0.12, INK.gold, x, 1.4, -0.58, BRASS);
    const roll = pivot(g, -0.4, 1.58, -0.58);
    rod(roll, 0.25, 1.95, c.accent, 0, 0, 0, 'x', undefined, 14);
    for (const x of [-0.6, 0, 0.6]) rod(roll, 0.255, 0.06, INK.gold, x, 0, 0, 'x', undefined, 14);
    block(roll, 1.95, 0.04, 0.08, INK.white, 0, 0.24, 0);
    rig(roll);
    block(g, 1.8, 0.012, 0.85, shade(c.accent, 1.25), -0.4, 1.106, -0.1);
    const turn = pivot(g, -0.4, 1.11, -0.05);
    rod(turn, 0.5, 0.02, INK.gold, 0, 0.01, 0, 'y', BRASS, 16);
    rig(turn);
    sample(turn, 'giftset', 2.0, 0, 0.02, 0);
    // the ribbon spool on its stand, its ribbon running to the gift
    block(g, 0.12, 0.8, 0.3, INK.iron, 1.55, 1.5, -0.35);
    const spool = pivot(g, 1.55, 1.75, -0.13);
    for (const z of [-0.08, 0.08]) rod(spool, 0.32, 0.03, INK.white, 0, 0, z, 'z', undefined, 14);
    rod(spool, 0.24, 0.14, INK.gold, 0, 0, 0, 'z', undefined, 14);
    block(spool, 0.05, 0.3, 0.02, INK.dark, 0, 0.17, 0.1);
    rig(spool);
    block(g, 1.3, 0.012, 0.05, INK.gold, 0.7, 1.55, -0.1).rotation.z = 0.12;
    // a shelf of finished gifts, and the till
    frame(g, 1.0, 1.6, 0.6, INK.walnut, -2.55, 0.15, -0.75, { post: 0.06 });
    for (const y of [0.7, 1.2]) block(g, 0.95, 0.04, 0.55, INK.walnut, -2.55, y, -0.75);
    pile(g, 'giftset', [[-2.8, 0.72, -0.75, 0.2, 0.9], [-2.3, 0.72, -0.75, -0.1, 0.9], [-2.55, 1.22, -0.75, 0.3, 0.9]]);
    cabinet(g, INK.white, 2.55, 0.15, -0.6, { w: 0.6, h: 1.0, d: 0.4, screen: 0xffd6f6, glow: c.accent });
    return {
      animate(t, dt) { roll.rotation.x += dt * 2; spool.rotation.z -= dt * 6; turn.rotation.y += dt * 1.2; },
      fit: { hopper: [-2.4, 1.1, 0.4], feed: 0.9, neon: [0.98, 0.65, 4.0, -0.1] },
    };
  },
};
/** One geometry of all the glowing ports of a furnace, each turned to face out of its wall. */
function portGeometry(ports) {
  const geos = ports.map(({ geo, at, turn }) => geo.rotateX(turn[0]).rotateY(turn[1]).translate(...at));
  const out = mergeSimple(geos);
  geos.forEach(q => q.dispose());
  return out;
}
/** Plain geometries (position and normal) joined into one. */
function mergeSimple(geos) {
  const parts = geos.map(q => q.index ? q.toNonIndexed() : q);
  let n = 0; for (const q of parts) n += q.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const q of parts) { pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** What flies off a machine while it works: where (in the machine's own space), how often, and what it looks like. */
export const WORK_FX = {
  saw: { every: 0.1, x: 0.5, wide: 0.5, y: 1.5, z: 0.4, item: true, o: { count: 1, speed: 1.5, up: 2.6, life: 0.5, size: 0.08, spread: 0.2 } },          // sawdust
  workshop: { every: 0.3, x: -0.55, wide: 0.4, y: 1.7, z: 0.35, item: true, o: { count: 1, speed: 1.2, up: 2.2, life: 0.5, size: 0.09, spread: 0.2 } },   // chips under the mallet
  cutter: { every: 0.14, x: 0, wide: 0.8, y: 1.6, z: 0.5, o: { count: 1, color: 0xd8d2c6, speed: 1.4, up: 2.0, life: 0.6, size: 0.1, gravity: 4 } },   // stone dust
  mill: { every: 0.28, x: 2.4, wide: 0.6, y: 0.9, z: 0.5, o: { count: 1, color: 0xfaf3df, speed: 0.6, up: 1.4, life: 0.8, size: 0.1, gravity: 2 } },     // flour
  oven: { every: 0.35, x: -0.4, wide: 0.4, y: 1.5, z: 1.0, o: { count: 1, color: 0xffb347, speed: 0.6, up: 2.2, life: 0.5, size: 0.06, gravity: 1 } }, // embers
  kiln: { every: 0.25, x: -0.8, wide: 0.3, y: 1.4, z: 0.85, o: { count: 1, color: 0xffc070, speed: 0.8, up: 1.6, life: 0.4, size: 0.06, gravity: 3 } },
  smelter: { every: 0.2, x: 0, wide: 0.6, y: 0.6, z: 0.9, o: { count: 1, color: 0xffb347, speed: 1.2, up: 2.6, life: 0.45, size: 0.07, gravity: 6 } },
  forge: { every: 0.18, x: 0.5, wide: 0.4, y: 1.15, z: 0.15, o: { count: 1, color: 0xffb347, speed: 2.0, up: 2.4, life: 0.4, size: 0.06, gravity: 7 } },
  goldsmelter: { every: 0.3, x: 1.2, wide: 0.5, y: 0.95, z: 0.2, item: true, o: { count: 1, speed: 0.8, up: 1.8, life: 0.5, size: 0.06, gravity: 4 } },
  steelmill: { every: 0.16, x: -1.05, wide: 0.6, y: 2.2, z: -0.35, o: { count: 1, color: 0xffc04a, speed: 1.6, up: 3.0, life: 0.5, size: 0.07, gravity: 7 } },
  jeweler: { every: 0.3, x: 1.55, wide: 0.2, y: 1.15, z: 0.65, item: true, o: { count: 1, speed: 1.0, up: 1.2, life: 0.4, size: 0.05, gravity: 3 } },
  gemcutter: { every: 0.14, x: 0.1, wide: 0.6, y: 1.25, z: 0.2, o: { count: 1, color: 0x9fd8ff, speed: 0.9, up: 1.5, life: 0.45, size: 0.06, gravity: 7 } },
  generator: { every: 0.45, x: 2.55, wide: 0.4, y: 1.85, z: -1.0, o: { count: 1, color: 0xbff4ff, speed: 0.9, up: 1.2, life: 0.25, size: 0.05, gravity: 2 } },
  carline: { every: 0.1, x: 0, wide: 2.2, y: 1.45, z: 0.1, o: { count: 1, color: 0xffe08a, speed: 2.0, up: 2.2, life: 0.35, size: 0.06, gravity: 8 } },
  robotline: { every: 0.3, x: 0, wide: 0.6, y: 1.4, z: 0.3, o: { count: 1, color: 0x9fd8ff, speed: 1.2, up: 1.6, life: 0.3, size: 0.05, gravity: 5 } },
  giftcounter: { every: 0.35, x: -0.4, wide: 0.6, y: 1.9, z: 0.0, item: true, o: { count: 1, speed: 0.9, up: 2.0, life: 0.6, size: 0.06, gravity: 3 } },
};
/** The machine for a recipe without one of its own, by its look. */
const BY_LOOK = { saw: 'saw', house: 'workshop', furnace: 'smelter', mill: 'mill', tank: 'refinery' };

const bright = hex => (0.299 * (hex >> 16 & 255) + 0.587 * (hex >> 8 & 255) + 0.114 * (hex & 255)) / 255;

/**
 * What sets this machine apart besides its body (see machineTraits in js/sim/yard.js): a sign with its product, a hopper
 * for loose material, a second feed, and a lit strip in the Metropolis.
 */
function dress(g, fit, recipe, traits) {
  // The sign: a board in the product's colour, high at the back corner, with the product itself on it.
  const sign = pivot(g, -3.45, 0, -0.7);
  rod(sign, 0.055, 2.7, 0x4a4f57, 0, 1.35, 0, 'y', undefined, 6, 0.07);
  const board = pivot(sign, 0.45, 3.0, 0.06); board.rotation.x = -0.45;   // leaning back, to face the camera above
  block(board, 0.98, 0.78, 0.07, traits.sign, 0, 0, 0, { round: 0.03 });
  // a panel behind the product, not a disc: a pale bar on a dark disc reads as a "no entry" sign
  block(board, 0.84, 0.62, 0.03, bright(traits.sign) > 0.55 ? 0x2b3037 : 0xf4ecd8, 0, 0, 0.045, { round: 0.012 });
  const out = recipe.output, spec = ITEMS[out].mesh, item = makeItem(out), size = 0.5 / itemSize(out);
  item.scale.setScalar(size);
  // flat things are shown from above, the way they lie on a pad; things that stand are shown standing
  const lying = spec.shape === 'torus' || spec.shape === 'hammer' || (spec.shape === 'box' && spec.size[1] < 0.9 * Math.min(spec.size[0], spec.size[2]));
  if (lying) { item.rotation.x = Math.PI / 2; item.position.set(spec.shape === 'hammer' ? -0.03 : 0, 0, 0.07 + stackBase(out) * size); }
  else { item.rotation.x = 0.45; item.position.set(0, -0.2 + stackBase(out) * size, 0.14); }
  board.add(item);

  if (traits.hopper != null && fit.hopper) {   // loose material is tipped in from above
    const [x, y, z] = fit.hopper;
    block(g, 0.36, 0.24, 0.36, INK.iron, x, y + 0.12, z);
    rod(g, 0.7, 0.62, 0x6f7780, x, y + 0.53, z, 'y', undefined, 4, 0.22).rotation.y = Math.PI / 4;
    rod(g, 0.72, 0.06, INK.hazard, x, y + 0.84, z, 'y', undefined, 4).rotation.y = Math.PI / 4;
    const heap = part(g, GEO.heap(), traits.hopper, x, y + 0.85, z, { flatShading: true, roughness: 0.95 }); heap.scale.set(1, 0.45, 1);
  }
  if (traits.twin != null) {   // a second material has a feed of its own, at the end where the materials arrive
    block(g, 0.5, 0.9, 1.0, 0x5c6670, -3.2, 0.45, 0.15, { ...PANEL(), round: 0.06 });
    block(g, 0.54, 0.12, 1.04, traits.twin, -3.2, 0.96, 0.15, { round: 0.04 });
    block(g, 0.5, 0.14, 0.3, 0x4a4f57, -3.0, fit.feed, 0.15);
  }
  if (traits.neon && fit.neon) {   // the Metropolis is lit: a strip in the machine's colour along its front
    const [y, z, w, x = 0] = fit.neon;
    lit(block(g, w, 0.09, 0.06, recipe.colors.accent, x, y, z, { map: null }), recipe.colors.accent, 0.35);
  }
}

/** The id of a recipe: its key in RECIPES. */
const idOf = recipe => Object.keys(RECIPES).find(k => RECIPES[k] === recipe) || Object.keys(RECIPES).find(k => RECIPES[k].output === recipe.output);

/**
 * Build the machine for `recipe` into `g` (the machine's own group: its middle on the ground, the belt in front at +z).
 * @param traits  machineTraits(recipe, ITEMS, location) from js/sim/yard.js
 * @returns animate(t, dt, power): called while it runs; chimneys: where it smokes; fx: what flies off while it works
 */
export function buildMachine(g, recipe, traits) {
  const id = idOf(recipe);
  const key = MACHINES[id] ? id : BY_LOOK[recipe.look] || 'workshop';
  const built = MACHINES[key](g, recipe.colors);
  dress(g, built.fit, recipe, traits);
  // Every model leaves here in its rest pose. Nine of them are put together with fires lit, a stream pouring or an arm
  // mid-stroke, and a machine that had never run showed that until its first batch was over (found by tools/bench/yards.mjs).
  built.animate(0, 0, 0);
  return { animate: built.animate, chimneys: g.userData.chimneys || null, fx: WORK_FX[key] || null };
}
