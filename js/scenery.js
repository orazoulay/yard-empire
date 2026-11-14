// What stands in a yard for the look of it: lamps along the fences, things by the fence that fit the
// yard's trade, the marks on its floor, the signpost at a gate, and the fireflies of the night. None of it
// is in anybody's way: everything here stands on the fence line or in the strip beside it.
// The lamps of the whole map are one draw; a yard's own things are joined into two meshes (js/gfx/props.js).
import * as THREE from 'three';
import { GLOW, LIGHT, mat } from './world.js';
import { glowMap, signBoard, wood } from './textures.js';
import { Batch, blockPart, merge, roundPart, solid } from './models.js';
import { lampPlan, yardDressing } from './sim/dressing.js';
import { buildDressing } from './gfx/props.js';

// ------------------------------------------------------------------------------------ lamps
const LAMP = { reach: 0.62, height: 3.0, pool: 7.5, inset: 0.32 };   // inset: how far inside the fence line a post stands, clear of the fence's own posts
let lamps = null;

function makeLamps(scene) {
  const IRON = 0x3a3f46;
  const post = merge([
    blockPart(0.24, 0.22, 0.24, IRON, [0, 0.11, 0]),
    roundPart(0.045, 0.065, LAMP.height, IRON, [0, LAMP.height / 2, 0], [0, 0, 0], 6),
    blockPart(LAMP.reach + 0.1, 0.05, 0.05, IRON, [LAMP.reach / 2, LAMP.height - 0.05, 0]),
    blockPart(0.36, 0.1, 0.22, IRON, [LAMP.reach, LAMP.height - 0.1, 0]),
  ]);
  const glass = mat(0xfff1c2, { emissive: 0xffd27a, emissiveIntensity: 0.05, roughness: 0.4 });
  glass.userData.byDay = 0.05; GLOW.push(glass);
  // The light on the ground is a bright see-through patch, not a light: it costs one flat square per lamp.
  const pool = new THREE.MeshBasicMaterial({ color: 0xffd9a0, alphaMap: glowMap(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  pool.userData.full = 0.34; pool.visible = false; LIGHT.push(pool);
  lamps = {
    posts: new Batch(scene, post, solid({ roughness: 0.55, metalness: 0.5 }), 240),
    bulbs: new Batch(scene, new THREE.BoxGeometry(0.28, 0.06, 0.16).translate(LAMP.reach, LAMP.height - 0.17, 0), glass, 240, { cast: false, receive: false }),
    pools: new Batch(scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pool, 300, { cast: false, receive: false }),
  };
  lamps.pools.mesh.renderOrder = 3;   // over the soft shadows and the clouds' shadows
}

/** A soft pool of light on the ground at (x, z), seen at night only. */
export function addLightPool(scene, x, z, size = LAMP.pool) {
  if (!lamps) makeLamps(scene);
  lamps.pools.add(x, 0.03, z, { sx: size, sy: 1, sz: size });
}

/** A lamp post at (x, z) whose arm reaches the way (nx, nz) points, with its pool of light. */
export function addLamp(scene, x, z, nx, nz) {
  if (!lamps) makeLamps(scene);
  const turn = Math.atan2(-nz, nx);
  lamps.posts.add(x, 0, z, { turn });
  lamps.bulbs.add(x, 0, z, { turn });
  addLightPool(scene, x + nx * LAMP.reach, z + nz * LAMP.reach);
}

/**
 * Lamps along the fences a yard draws: two to a side, a quarter of the way in from each corner, and
 * moved clear of the gate where one would stand in it.
 * @param sides  [{ side, x1, z1, x2, z2 }] the sides this yard fences
 * @param gate   { side, at } of the yard's gate, or null
 * @param clear  how far from the middle of the gate a lamp must keep
 * @returns where they stand, as stretches of fence ({ side, at, half }) for other things to keep clear of
 */
export function addFenceLamps(scene, bounds, sides, gates, clear) {
  const taken = [];
  for (const l of lampPlan(bounds, sides, gates, clear)) {   // where they stand is worked out as plain numbers (js/sim/dressing.js)
    addLamp(scene, l.x + l.nx * LAMP.inset, l.z + l.nz * LAMP.inset, l.nx, l.nz);
    taken.push({ side: l.side, at: l.at, half: 0.9 });
  }
  return taken;
}

// ------------------------------------------------------------------------------------ things by the fence
/**
 * Dress a yard: the things that stand along the inside of its fence and fit its trade (log decks and a timber shed at
 * the sawmill, hay and a wind pump on the farm, pipe racks in the city, neon and planters in the Metropolis), the
 * marks on its floor, and the pools of light under whatever carries a lamp. js/sim/dressing.js decides what stands
 * where; js/gfx/props.js draws it, as two meshes for the whole yard.
 * @param group  the yard's own group
 * @param cfg    the yard, from the data file
 * @param lamps  where its lamp posts stand (what addFenceLamps returned)
 * @returns the plan: { props, quads, rings, lights, tris }
 */
export function dressYard(scene, group, cfg, lamps) {
  const plan = yardDressing(cfg, { lamps });
  for (const mesh of buildDressing(plan)) group.add(mesh);
  for (const l of plan.lights) addLightPool(scene, l.x, l.z, l.size);
  return plan;
}

// ------------------------------------------------------------------------------------ the signpost at a gate
/**
 * A wooden signpost with a name and an arrow, facing the camera.
 * @param dir  which way the arrow points on the board: 'left', 'right', 'up' (away) or 'down' (toward the camera)
 */
export function makeSignpost(text, dir) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 2.3, 6), mat(0x8b4a24, wood({ upright: true })));
  post.position.y = 1.15; post.castShadow = true; post.receiveShadow = true; g.add(post);
  const board = new THREE.Group(); board.position.set(0, 2.05, 0.08); board.rotation.x = -0.3;   // leaning back, to face the camera above
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.78, 0.07), mat(0xa35a2c, wood({ rx: 1.5 })));
  plank.castShadow = true; board.add(plank);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.88, 0.7), mat(0xffffff, { map: signBoard(text, dir), roughness: 0.9 }));
  face.position.z = 0.037; board.add(face);
  g.add(board);
  return g;
}

// ------------------------------------------------------------------------------------ fireflies
const FLIES = 36, FLY_RANGE = 30;

/** Small lights that drift among the trees after dark. They keep to the forest around what the camera looks at. */
export class Fireflies {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xe6ff8a, toneMapped: false }), FLIES);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flies = [];
    for (let i = 0; i < FLIES; i++) this.flies.push({ x: 0, z: 0, home: false, phase: Math.random() * 6.28, pace: 0.6 + Math.random() * 0.6 });
    this.t = 0;
    this.m = new THREE.Matrix4();
    scene.add(this.mesh);
  }
  /**
   * @param night     0 by day, 1 at night
   * @param focus     what the camera looks at
   * @param inForest  (x, z) => true where trees grow: fireflies settle only there
   * @param count     how many to show (fewer on the low graphics level)
   */
  update(dt, night, focus, inForest, count = FLIES) {
    if (night < 0.15) { this.mesh.visible = false; return; }
    this.mesh.visible = true; this.mesh.count = Math.min(count, FLIES);
    this.t += dt;
    const m = this.m, e = m.elements, glow = (night - 0.15) / 0.85;
    for (let i = 0; i < this.mesh.count; i++) {
      const f = this.flies[i];
      if (!f.home || Math.abs(f.x - focus.x) > FLY_RANGE || Math.abs(f.z - focus.z) > FLY_RANGE) {
        // look for a new place among the trees near the camera; one try a frame is plenty
        const x = focus.x + (Math.random() - 0.5) * 2 * FLY_RANGE, z = focus.z - 6 + (Math.random() - 0.5) * 2 * FLY_RANGE;
        f.home = inForest(x, z);
        if (f.home) { f.x = x; f.z = z; }
      }
      const a = this.t * f.pace + f.phase;
      const s = f.home ? glow * (0.55 + 0.45 * Math.sin(a * 3.1)) : 0;   // they glow and dim, each in its own time
      e[0] = e[5] = e[10] = s;
      e[12] = f.x + Math.sin(a * 0.7) * 1.3; e[13] = 0.9 + Math.sin(a * 1.1 + f.phase) * 0.5; e[14] = f.z + Math.cos(a * 0.5) * 1.3;
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
