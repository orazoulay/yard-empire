// What stands in a yard for the look of it: lamps along the fences, things by the fence that fit the
// yard's trade, the signpost at a gate, and the fireflies of the night. None of it is in anybody's way:
// everything here stands on the fence line or in the strip beside it where nobody can walk.
// Repeated things are drawn together, one draw for all the lamps of the map, one for all the barrels.
import * as THREE from 'three';
import { GLOW, LIGHT, mat, mulberry, roundedBox } from './world.js';
import { glowMap, signBoard, wood } from './textures.js';
import { Batch, blockPart, merge, roundPart, solid } from './models.js';
import { fenceSpots } from './sim/yard.js';

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
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2, taken = [];
  for (const { side, x1, z1, x2, z2 } of sides) {
    const alongX = side === 'n' || side === 's';
    for (const t of [0.25, 0.75]) {
      let x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      for (const gate of [].concat(gates || [])) {   // one gate or several: a lamp never stands in an opening
        if (!gate || gate.side !== side) continue;
        const along = alongX ? x : z, off = along - gate.at;
        if (Math.abs(off) < clear) { const moved = gate.at + (off < 0 ? -clear : clear); if (alongX) x = moved; else z = moved; }
      }
      const nx = alongX ? 0 : Math.sign(cx - x), nz = alongX ? Math.sign(cz - z) : 0;   // into the yard
      addLamp(scene, x + nx * LAMP.inset, z + nz * LAMP.inset, nx, nz);
      taken.push({ side, at: alongX ? x : z, half: 0.9 });
    }
  }
  return taken;
}

// ------------------------------------------------------------------------------------ things by the fence
const BARK = 0x6b4226, CUT = 0xe2bd8a, STEEL = 0xb9c0c7, STRAW = 0xe3c765;
const flat = [0, 0, Math.PI / 2];   // a cylinder turned to lie along x
// Each kind: how it is built (lazily, once), and the colours its copies are tinted with (white = as built).
const KINDS = {
  stump: { build: () => merge([roundPart(0.24, 0.3, 0.42, BARK, [0, 0.21, 0], [0, 0, 0], 8), roundPart(0.225, 0.225, 0.02, CUT, [0, 0.425, 0], [0, 0, 0], 8)]) },
  // a chopping block with the axe left in it
  block: { build: () => merge([
    roundPart(0.26, 0.3, 0.5, BARK, [0, 0.25, 0], [0, 0, 0], 8), roundPart(0.245, 0.245, 0.02, CUT, [0, 0.505, 0], [0, 0, 0], 8),
    blockPart(0.045, 0.55, 0.045, 0x9c6b3c, [0.12, 0.74, 0], [0, 0, -0.5]), blockPart(0.17, 0.11, 0.035, STEEL, [-0.02, 0.56, 0], [0, 0, -0.5]),
  ]) },
  logs: { build: () => merge([[-0.15, 0.14, 0], [0.15, 0.14, 0], [0, 0.39, 0]].flatMap(([z, y]) => [
    roundPart(0.14, 0.14, 0.72, 0xa8672f, [0, y, z], flat, 8), roundPart(0.125, 0.125, 0.74, CUT, [0, y, z], flat, 8),
  ])) },
  sacks: { build: () => merge([[-0.24, 0.13, 0, 0], [0.24, 0.13, 0, 0.12], [0, 0.37, 0.2, -0.1]].map(([x, y, , turn]) => (
    { geo: roundedBox(0.44, 0.26, 0.3, 0.1, 1), color: 0xe9e1cc, at: [x, y, 0], turn: [0, turn, 0] }))) },
  bale: { build: () => merge([
    { geo: roundedBox(0.62, 0.4, 0.42, 0.06, 1), color: STRAW, at: [0, 0.2, 0] },
    ...[-0.17, 0.17].map(x => blockPart(0.03, 0.41, 0.43, 0x9c7a3a, [x, 0.2, 0])),
  ]) },
  barrel: { tints: [0xd94a36, 0x3f7fc4, 0x3a3f46, 0x4c9a5a, 0xe0a52f], build: () => merge([
    roundPart(0.21, 0.21, 0.56, 0xffffff, [0, 0.28, 0], [0, 0, 0], 10),
    ...[0.02, 0.28, 0.54].map(y => roundPart(0.225, 0.225, 0.04, 0xb0b0b0, [0, y, 0], [0, 0, 0], 10)),
    roundPart(0.17, 0.17, 0.012, 0xcfcfcf, [0, 0.563, 0], [0, 0, 0], 10),
  ]) },
  crate: { tints: [0xc99a5b, 0xb5803f, 0xd9b47c, 0xa9713a], stack: true, build: () => merge([
    blockPart(0.46, 0.46, 0.46, 0xffffff, [0, 0.25, 0]),
    ...[-0.22, 0.22].flatMap(x => [-0.22, 0.22].map(z => blockPart(0.07, 0.5, 0.07, 0xc4c4c4, [x, 0.25, z]))),   // corner posts
    ...[0.03, 0.47].map(y => blockPart(0.5, 0.06, 0.5, 0xc4c4c4, [0, y, 0])),                                     // top and bottom frames
  ]) },
  rock: { tints: [0x8d9294, 0x9da2a3, 0x7c8183, 0xa7a299], flatShading: true, build: () => new THREE.DodecahedronGeometry(0.28, 0).scale(1.15, 0.8, 0.9).translate(0, 0.19, 0) },
};
// What stands in which kind of yard, and which yards are of which kind. More of what is listed more often.
const SETS = {
  wood: ['stump', 'block', 'logs', 'stump', 'logs', 'crate'],
  stone: ['rock', 'rock', 'crate', 'rock', 'barrel'],
  farm: ['sacks', 'bale', 'sacks', 'bale', 'barrel'],
  oil: ['barrel', 'barrel', 'barrel', 'crate'],
  works: ['crate', 'barrel', 'crate', 'sacks'],
  city: ['crate', 'crate', 'barrel', 'crate'],
};
const YARDS = { sawmill: 'wood', carpentry: 'wood', quarry: 'stone', farm: 'farm', bakery: 'farm', ironmine: 'stone', oilfield: 'oil', goldmine: 'stone', gemmine: 'stone' };
const batches = {};

function place(scene, name, x, y, z, turn, size, pick) {
  const kind = KINDS[name];
  let b = batches[name];
  if (!b) {
    const material = kind.flatShading ? mat(0xffffff, { flatShading: true, roughness: 0.95 }) : solid();   // a rock is one plain shape; the rest carry their colours
    b = batches[name] = new Batch(scene, kind.build(), material, 260, { tinted: !!kind.tints });
  }
  b.add(x, y, z, { turn, sx: size, color: kind.tints ? kind.tints[Math.floor(pick * kind.tints.length * 0.999)] : null });
}

/**
 * The things that stand along the inside of a yard's fence: stumps and a chopping block at the sawmill,
 * sacks and bales on the farm, barrels on the oil field, rocks at the mines, crates in the cities.
 * @param cfg   the yard, from the data file
 * @param gaps  stretches of fence to keep clear (gates, and what already stands there)
 */
export function addYardProps(scene, cfg, gaps) {
  let seed = 11; for (const ch of cfg.id) seed = seed * 31 + ch.charCodeAt(0) | 0;
  const rnd = mulberry(seed), set = SETS[YARDS[cfg.id] || (cfg.location === 'town' ? 'works' : 'city')];
  for (const s of fenceSpots(cfg.bounds, gaps, 13, rnd)) {
    const name = set[Math.floor(rnd() * set.length * 0.999)], kind = KINDS[name], size = 0.92 + rnd() * 0.2;
    const alongX = s.side === 'n' || s.side === 's', turn = s.turn + (rnd() - 0.5) * 0.3;
    place(scene, name, s.x, 0, s.z, turn, size, rnd());
    if (!kind.tints) continue;
    // barrels, crates and rocks come in twos and threes: one more beside it, and sometimes a crate on top
    const step = 0.58 * (rnd() < 0.5 ? -1 : 1), more = rnd();
    if (more < 0.7) place(scene, name, s.x + (alongX ? step : 0), 0, s.z + (alongX ? 0 : step), turn + rnd() * 0.5, 0.88 + rnd() * 0.2, rnd());
    if (kind.stack && more < 0.3) place(scene, name, s.x + (alongX ? step * 0.5 : 0), 0.5 * size, s.z + (alongX ? 0 : step * 0.5), turn + 0.4, 0.86, rnd());
  }
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
