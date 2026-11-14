// Scene, lights, ground, trees and the follow camera.
import * as THREE from 'three';

import { bark, edge, grass, rings } from './textures.js';
import { cityEdge, mulberry, offRects } from './sim/site.js';
import { cameraFrame } from './sim/yard.js';
import { sharedMaterial, boxShape, cylinderShape, glowing } from './engine/materials.js';
export { mulberry };   // the run of numbers the scenery is drawn from; it lives with the plain layouts now (js/sim/site.js)

/**
 * The one material everything solid is made of. It answers to light the way real surfaces do: rough
 * ones scatter it, smooth and metallic ones mirror the sky (see skyLight). Pass roughness, metalness,
 * a map and so on in `extra` to say what the thing is made of.
 */
export function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, envMapIntensity: 0.42, ...extra });
}
/** Bare, bright metal: blades, tools, pipes. */
export const METAL = { metalness: 0.9, roughness: 0.3, envMapIntensity: 0.8 };
/**
 * A block with rounded edges. A cube cut into a few strips per side is pushed out to the shape: the
 * outer strips bend around the edges and corners, the middle of each face stays flat. Every face keeps
 * a picture of its own (0..1 across it), so the same surfaces fit as on a plain block.
 * @param r     radius of the edges
 * @param fine  strips per edge: 1 for small parts, 2 for large ones seen from close
 */
const rounded = new Map();
export function roundedBox(w, h, d, r, fine = 1) {
  const key = [w, h, d, r, fine].join('/');
  if (rounded.has(key)) return rounded.get(key);
  const n = fine * 2 + 1, half = 0.5 / n;   // an odd count: no row of points on the middle line of a face
  const geo = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r), p = new THREE.Vector3(), nn = new THREE.Vector3();
  const perFace = (n + 1) * (n + 1);
  // which way u and v run on each of the six faces, in the order a box is built: +x, -x, +y, -y, +z, -z
  const UV = [['z', -1, d, 'y', 1, h], ['z', 1, d, 'y', 1, h], ['x', 1, w, 'z', -1, d], ['x', 1, w, 'z', 1, d], ['x', 1, w, 'y', 1, h], ['x', -1, w, 'y', 1, h]];
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    nn.set(p.x - Math.sign(p.x) * half, p.y - Math.sign(p.y) * half, p.z - Math.sign(p.z) * half).normalize();   // straight out on the flat part
    p.set(inner.x * Math.sign(p.x) + nn.x * r, inner.y * Math.sign(p.y) + nn.y * r, inner.z * Math.sign(p.z) + nn.z * r);
    pos.setXYZ(i, p.x, p.y, p.z); nor.setXYZ(i, nn.x, nn.y, nn.z);
    const [ua, us, ul, va, vs, vl] = UV[Math.floor(i / perFace)];
    uv.setXY(i, 0.5 + us * p[ua] / ul, 0.5 + vs * p[va] / vl);
  }
  geo.userData.shared = true;
  rounded.set(key, geo);
  return geo;
}

let edgeMap = null;
/**
 * The material for a part made by box() or cyl(): shared with every other part made of the same (js/engine/materials.js),
 * unless `unique` is set because this one will be changed later (a colour that is repainted, a glow turned up).
 */
function part(color, { unique = false, ...extra } = {}) {
  const params = { color, roughness: 0.82, metalness: 0, envMapIntensity: 0.42, ...extra };
  return unique ? new THREE.MeshStandardMaterial(params) : sharedMaterial(params);
}
/**
 * A block. In `extra`, besides what a material takes: round = radius of its edges (0 or none for a
 * sharp block), fine = how finely they are rounded, unique = a material of its own (see part()).
 */
export function box(w, h, d, color, { round = 0, fine = 1, ...extra } = {}) {
  // Every face of a block is shaded a little toward its edges, unless it brings a surface of its own.
  const r = Math.min(round, w / 2, h / 2, d / 2);
  const geo = r > 0.001 ? roundedBox(w, h, d, r, fine) : boxShape(w, h, d);
  const m = new THREE.Mesh(geo, part(color, { map: edgeMap || (edgeMap = edge()), ...extra }));
  m.castShadow = true; m.receiveShadow = true; return m;
}
export function cyl(rt, rb, h, color, seg = 10, extra) {
  const m = new THREE.Mesh(cylinderShape(rt, rb, h, seg), part(color, extra));
  m.castShadow = true; m.receiveShadow = true; return m;
}
/** Make a mesh glow after dark: windows, screens, lamps. byDay is how much of the glow shows in daylight. */
export function lit(mesh, glow, byDay) {
  mesh.material = glowing(mesh.material, glow, byDay, GLOW);
  mesh.castShadow = false;
  return mesh;
}

const SUN = [15, 26, 9];   // where the sun stands at the start, from whatever the camera looks at
/** Where the sun stands right now; js/sky.js moves it through the day. */
export const sunAt = new THREE.Vector3(...SUN);
/** Seconds of wind so far: the trees sway by it (js/sky.js counts it up). */
export const wind = { value: 0 };
/** Materials that light up at night, such as windows: js/sky.js sets how brightly. userData.byDay is their glow by day. */
export const GLOW = [];
/** See-through patches of light, such as the pool under a lamp: js/sky.js fades them in at night. userData.full is how strong they get. */
export const LIGHT = [];
/** Ground that darkens and shines in the rain: js/sky.js soaks and dries it. */
export const WET = [];
/** Put a ground material on the list of what the rain soaks, remembering how it looks dry. */
export function soaks(material) {
  material.userData.dry = { roughness: material.roughness, color: material.color.clone(), shine: material.envMapIntensity };
  WET.push(material);
  return material;
}
/** The tops of the chimneys around the city, in the world: smoke rises from them while the city works. */
export const CITY_STACKS = [];

/**
 * Light from all around for surfaces to mirror: a pale blue sky, a warm horizon, green thrown up by
 * the ground and one bright sun. Made once, from a small painted sphere; nothing is loaded.
 */
export function skyLight(renderer) {
  const sky = new THREE.Scene();
  const geo = new THREE.SphereGeometry(20, 32, 16), pos = geo.attributes.position, colors = [];
  const top = new THREE.Color(0x8ec5ff), horizon = new THREE.Color(0xfff3dc), ground = new THREE.Color(0x7c9a52), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 20;
    if (y >= 0) c.copy(horizon).lerp(top, Math.pow(y, 0.6)); else c.copy(horizon).lerp(ground, Math.min(1, -y * 3));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  sky.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(30, 27, 22) }));   // far brighter than white
  sunBall.position.set(...SUN).normalize().multiplyScalar(18); sky.add(sunBall);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(sky, 0.03).texture;
  pmrem.dispose(); geo.dispose();
  return env;
}

/**
 * Make a material for instanced trees sway in the wind: each tree in its own rhythm, taken from where
 * it stands, and more the higher the tier. Only what is drawn moves; the shadows stay as they are.
 */
function swaying(material) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float swayAt = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
        float bend = (position.y + 0.5) * 0.035 * instanceMatrix[3].y;
        transformed.x += sin(uWind * 1.3 + swayAt) * bend;
        transformed.z += cos(uWind * 1.1 + swayAt * 1.3) * bend * 0.6;
      #endif`);
  };
  return material;
}

// Pines: a trunk and three tiers of needles, each tree in its own shade of green.
const TREE = {
  trunkGeo: new THREE.CylinderGeometry(0.2, 0.36, 1.4, 6),
  coneGeo: new THREE.ConeGeometry(1, 1, 7),   // a cone of 1 by 1: every tier scales it
  trunkMat: mat(0x6b4226, { roughness: 0.95 }),
  leafMat: swaying(mat(0xffffff, { flatShading: true, roughness: 0.9 })),   // white: the colour comes from each tree
  tiers: [[1.55, 2.0, 2.1], [1.2, 1.8, 3.25], [0.8, 1.7, 4.35]],   // radius, height, height of the middle
  greens: [0x2a6e3c, 0x2f7d43, 0x39914d, 0x47a558],
};

/** Instanced pine trees at the given [x, z, scale, rot] positions. Returns a group. */
export function makeTrees(positions) {
  const group = new THREE.Group();
  if (!positions.length) return group;
  const n = positions.length;
  const trunks = new THREE.InstancedMesh(TREE.trunkGeo, TREE.trunkMat, n);
  const tiers = TREE.tiers.map(() => new THREE.InstancedMesh(TREE.coneGeo, TREE.leafMat, n));
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  positions.forEach(([x, z, sc, r], i) => {
    q.identity();
    p.set(x, 0.7 * sc, z); s.set(sc, sc, sc); m.compose(p, q, s); trunks.setMatrixAt(i, m);
    const green = TREE.greens[Math.floor(r * 3.999)];
    TREE.tiers.forEach(([radius, height, y], t) => {
      q.setFromAxisAngle(up, r * 6 + t * 0.45);   // each tier turned a little, so the edges do not line up
      p.set(x, y * sc, z); s.set(radius * sc, height * sc, radius * sc); m.compose(p, q, s); tiers[t].setMatrixAt(i, m);
      tiers[t].setColorAt(i, c.setHex(green).multiplyScalar(1 + t * 0.14));   // lighter toward the top, where the sun reaches
    });
  });
  for (const t of [trunks, ...tiers]) { t.castShadow = true; t.receiveShadow = true; group.add(t); }
  return group;
}

// Broadleaf trees: a taller bare trunk and a crown of three rounded clumps, in lighter greens than the pines.
const ROUND = {
  trunkGeo: new THREE.CylinderGeometry(0.16, 0.3, 2.0, 6),
  clumpGeo: new THREE.IcosahedronGeometry(1, 1),
  clumps: [[0, 3.1, 0, 1.45, 1.2], [0.75, 2.55, 0.35, 1.0, 0.85], [-0.65, 2.7, -0.4, 1.1, 0.9]],   // x, height, z, width, height of the clump
  greens: [0x4f9a3f, 0x5aa845, 0x6dbb4e, 0x7cc257],
};

/** Instanced round-crowned trees at [x, z, scale, rot] positions, to mix among the pines. */
export function makeRoundTrees(positions) {
  const group = new THREE.Group(), n = positions.length;
  if (!n) return group;
  const trunks = new THREE.InstancedMesh(ROUND.trunkGeo, TREE.trunkMat, n);
  const clumps = ROUND.clumps.map(() => new THREE.InstancedMesh(ROUND.clumpGeo, TREE.leafMat, n));
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  positions.forEach(([x, z, sc, r], i) => {
    q.identity();
    p.set(x, 1.0 * sc, z); s.set(sc, sc, sc); trunks.setMatrixAt(i, m.compose(p, q, s));
    const green = ROUND.greens[Math.floor(r * 3.999)], turn = r * 6.283, cos = Math.cos(turn), sin = Math.sin(turn);
    ROUND.clumps.forEach(([cx, y, cz, wide, tall], k) => {
      q.setFromAxisAngle(up, turn + k * 1.3);
      p.set(x + (cx * cos - cz * sin) * sc, y * sc, z + (cx * sin + cz * cos) * sc); s.set(wide * sc, tall * sc, wide * sc);
      clumps[k].setMatrixAt(i, m.compose(p, q, s));
      clumps[k].setColorAt(i, c.setHex(green).multiplyScalar(k === 0 ? 1.12 : 0.96));   // the top clump catches the sun
    });
  });
  for (const t of [trunks, ...clumps]) { t.castShadow = true; t.receiveShadow = true; group.add(t); }
  return group;
}

/** Stumps where trees were felled, at [x, z, scale, rot] positions: bark around, year rings on top. */
function makeStumps(positions) {
  const n = positions.length;
  if (!n) return new THREE.Group();
  const side = mat(0x6b4226, bark()), top = mat(0xffffff, rings());
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.38, 0.5, 9), [side, top, side], n);
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  positions.forEach(([x, z, sc, r], i) => {
    const h = 0.7 + r * 0.6;
    p.set(x, 0.25 * h, z); s.set(sc, h, sc); q.setFromAxisAngle(up, r * 6.283); mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/** Flowers in the grass, at [x, z, size, turn] positions: three small heads each, in one of a few colours. */
function makeFlowers(positions) {
  const HEADS = [0xffffff, 0xffe066, 0xff9ec4, 0xc9a6ff, 0xffb347], per = 3;
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), mat(0xffffff, { flatShading: true, roughness: 0.7 }), Math.max(1, positions.length * per));
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), c = new THREE.Color();
  positions.forEach(([x, z, size, turn], i) => {
    const hue = HEADS[Math.floor(turn * HEADS.length * 0.999)];
    for (let k = 0; k < per; k++) {
      const a = turn * 6.283 + k * 2.1, far = 0.16 + 0.1 * k;
      p.set(x + Math.cos(a) * far, 0.1 + 0.05 * k + size * 0.06, z + Math.sin(a) * far); s.set(size, size * 0.55, size);
      mesh.setMatrixAt(i * per + k, m.compose(p, q, s));
      mesh.setColorAt(i * per + k, c.setHex(hue));
    }
  });
  mesh.count = positions.length * per;
  mesh.receiveShadow = true;   // too small to throw a shadow worth drawing
  return mesh;
}

/** Bushes and stones between the trees, at [x, z, size, turn] positions: the forest floor is not a lawn. */
function makeUndergrowth(bushes, stones) {
  const group = new THREE.Group();
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
  const fill = (geo, material, list, shape, tint) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach(([x, z, size, turn], i) => {
      q.setFromEuler(e.set(turn * 0.6, turn * 6, turn * 0.4));
      const [sx, sy, sz, y] = shape(size, turn);
      p.set(x, y, z); s.set(sx, sy, sz); mesh.setMatrixAt(i, m.compose(p, q, s));
      mesh.setColorAt(i, c.setHex(tint[Math.floor(turn * tint.length * 0.999)]));
    });
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  };
  fill(new THREE.IcosahedronGeometry(0.6, 0), mat(0xffffff, { flatShading: true, roughness: 0.9 }), bushes,
    size => [size, size * 0.7, size, size * 0.3], [0x3f8f47, 0x4ea352, 0x63b55c, 0x357f40]);
  fill(new THREE.DodecahedronGeometry(0.4, 0), mat(0xffffff, { flatShading: true, roughness: 0.95 }), stones,
    (size, turn) => [size * 1.3, size * (0.6 + turn * 0.3), size, size * 0.12], [0x8d9294, 0x9da2a3, 0x7c8183]);
  return group;
}

export function randomTreesIn(rect, count, seed, pad = 2.5) {
  const rnd = mulberry(seed), out = [];
  for (let i = 0; i < count; i++) {
    const x = rect.minX + pad + rnd() * (rect.maxX - rect.minX - 2 * pad);
    const z = rect.minZ + pad + rnd() * (rect.maxZ - rect.minZ - 2 * pad);
    out.push([x, z, 0.8 + rnd() * 0.6, rnd()]);
  }
  return out;
}

/**
 * @param areaRects  the yards: nothing of the forest grows on them
 * @param clear      more ground to keep free of trees and of the city's buildings (the building site's plot)
 */
export function createWorld(areaRects, clear = []) {
  const scene = new THREE.Scene();
  // The scene itself never moves. Left to itself it would still work out every matrix under it on every
  // frame; like this, whatever is out of sight can be skipped whole (see `show` in js/stations.js).
  scene.matrixAutoUpdate = false;
  scene.background = new THREE.Color(0x8fcf5a);
  scene.fog = new THREE.Fog(0x8fcf5a, 50, 110);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 250);

  // A warm sun from the side, low enough to throw shadows with some length, and a cool sky to fill them.
  const hemi = new THREE.HemisphereLight(0xdcecff, 0x7f9a52, 0.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 3.0);
  sun.position.set(...SUN);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const map = {
    minX: Math.min(...areaRects.map(r => r.minX)), maxX: Math.max(...areaRects.map(r => r.maxX)),
    minZ: Math.min(...areaRects.map(r => r.minZ)), maxZ: Math.max(...areaRects.map(r => r.maxZ)),
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), soaks(mat(0xffffff, { ...grass(88, 88), roughness: 0.95 })));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  ground.position.set((map.minX + map.maxX) / 2, 0, (map.minZ + map.maxZ) / 2); scene.add(ground);

  // Forest everywhere except inside any area rectangle.
  const rnd = mulberry(7), pines = [], rounds = [], stumps = [];
  // Which tree stands where is drawn from a second run of numbers, so the forest stays where it always was.
  const kind = mulberry(19), home = areaRects[0], homeX = (home.minX + home.maxX) / 2, homeZ = (home.minZ + home.maxZ) / 2;
  const M = 34;   // forest margin around the map
  const within = (x, z, r, pad) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;
  for (let i = 0; i < 900; i++) {
    const x = map.minX - M + rnd() * (map.maxX - map.minX + 2 * M), z = map.minZ - M + rnd() * (map.maxZ - map.minZ + 2 * M);
    // rects flagged `city` keep the forest further away: asphalt and buildings stand around them instead
    if (areaRects.some(r => { const pad = r.city ? 13 : 2.5; return x > r.minX - pad && x < r.maxX + pad && z > r.minZ - 2.5 && z < r.maxZ + pad; })) continue;
    const tree = [x, z, 0.8 + rnd() * 0.6, rnd()], pick = kind(), far = Math.hypot(x - homeX, z - homeZ);
    // At the forest's edge, next to a yard, some trees have been felled. Away from the sawmill, where
    // nobody plants pines for timber, broadleaf trees grow among them, more of them the further out.
    if (pick < 0.3 && areaRects.some(r => !r.city && within(x, z, r, 5.5))) stumps.push(tree);
    else if (far > 34 && pick > 1 - Math.min(0.55, 0.2 + (far - 34) / 90)) rounds.push(tree);
    else pines.push(tree);
  }
  // Ground kept free for something else (the building site's plot): what fell on it is taken out afterwards, so that
  // every other tree, bush and flower stays where it always was.
  scene.add(makeTrees(offRects(pines, clear)), makeRoundTrees(offRects(rounds, clear)), makeStumps(offRects(stumps, clear)));
  const bushes = [], stones = [], flowers = [];
  for (let i = 0; i < 1500; i++) {
    const x = map.minX - M + rnd() * (map.maxX - map.minX + 2 * M), z = map.minZ - M + rnd() * (map.maxZ - map.minZ + 2 * M);
    if (areaRects.some(r => { const pad = r.city ? 13 : 1.2; return x > r.minX - pad && x < r.maxX + pad && z > r.minZ - 1.2 && z < r.maxZ + pad; })) continue;
    (rnd() < 0.72 ? bushes : stones).push([x, z, 0.5 + rnd() * 0.8, rnd()]);
  }
  for (let i = 0; i < 620; i++) {
    const x = map.minX - M + kind() * (map.maxX - map.minX + 2 * M), z = map.minZ - M + kind() * (map.maxZ - map.minZ + 2 * M);
    if (areaRects.some(r => { const pad = r.city ? 13 : 0.9; return x > r.minX - pad && x < r.maxX + pad && z > r.minZ - 0.9 && z < r.maxZ + pad; })) continue;
    flowers.push([x, z, 0.7 + kind() * 0.7, kind()]);
  }
  const undergrowth = makeUndergrowth(offRects(bushes, clear), offRects(stones, clear)), blossom = makeFlowers(offRects(flowers, clear));
  scene.add(undergrowth, blossom);
  const city = areaRects.filter(r => r.city);
  if (city.length) scene.add(makeCityEdge(city, clear));
  // What the low graphics level thins out. The instances were placed at random, so drawing only the
  // first part of each list thins evenly; nothing is rebuilt, and the full count comes back the same way.
  const thinned = [...undergrowth.children, blossom].map(mesh => ({ mesh, full: mesh.count }));
  function setDetail(low) {
    for (const t of thinned) { t.mesh.count = low ? Math.ceil(t.full * 0.4) : t.full; t.mesh.castShadow = !low && t.mesh !== blossom; }
  }

  /**
   * @param target  world point to look at
   * @param aspect  viewport aspect
   * @param zoom    1 = normal, >1 = further away (used for the area reveal)
   */
  let shadowHalf = 32;
  const _toSun = new THREE.Vector3(), _right = new THREE.Vector3(), _side = new THREE.Vector3(), _at = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function updateCamera(target, aspect, zoom = 1) {
    // A tall phone pulls back for its height, a wide screen for its depth (js/sim/yard.js, cameraFrame).
    const { vFov, dist } = cameraFrame(aspect, zoom);
    // The fog starts and ends further away when the camera is pulled back (a new yard or the building site being shown,
    // the player's own zoom): at a fixed distance it would wash a far view out to green. What lies past it is not drawn
    // (js/view.js reads the same distance).
    const back = Math.max(1, dist / cameraFrame(aspect, 1).dist);
    scene.fog.near = 50 * back; scene.fog.far = 110 * back; camera.far = Math.max(250, 140 * back);
    camera.userData.fogFar = scene.fog.far;
    camera.fov = vFov;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    camera.position.set(target.x, 17 * dist, target.z + 11.5 * dist);
    camera.lookAt(target.x, 0, target.z - 1.5);
    camera.updateMatrixWorld();   // so labels projected this frame use the new camera, not last frame's
    // Zoomed out, more ground is in sight than the shadows cover: widen them (they get a little softer).
    // Not for the small zoom of the camera's own moves, or the shadows would shimmer with every step.
    const half = zoom > 1.12 ? 32 * zoom : 32;
    if (Math.abs(half - shadowHalf) > 0.5) {
      shadowHalf = half;
      const cam = sun.shadow.camera;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
    }
    // The shadows follow the camera, but only in whole texels of the shadow map, seen from the sun: moved by part of a
    // texel, every shadow edge would be drawn over a slightly different set of texels and crawl as the player walks.
    _toSun.copy(sunAt).normalize();
    _right.crossVectors(_up, _toSun).normalize(); _side.crossVectors(_toSun, _right);
    const texel = 2 * shadowHalf / sun.shadow.mapSize.x;
    _at.set(target.x, 0, target.z);
    const u = _at.dot(_right), v = _at.dot(_side);
    _at.addScaledVector(_right, Math.round(u / texel) * texel - u).addScaledVector(_side, Math.round(v / texel) * texel - v);
    sun.position.copy(_at).add(sunAt);
    sun.target.position.copy(_at);
  }
  return { scene, camera, updateCamera, sun, hemi, setDetail };
}

/**
 * What stands around Industrial City: asphalt on three sides, low buildings to the south and at the
 * ends, and two striped chimneys. Nothing here is taller than the camera can see over, and nothing
 * lies under a yard (the yards draw their own ground).
 */
function makeCityEdge(rects, clear = []) {
  const g = new THREE.Group();
  // Where everything stands is worked out as plain numbers (js/sim/site.js, cityEdge), from the run of numbers it was
  // always drawn from; `clear` is ground to keep free, and the buildings that stood on it are left out.
  const layout = cityEdge(rects, clear);
  const slab = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), soaks(mat(0x5c626b)));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2); m.receiveShadow = true; g.add(m);
  };
  for (const s of layout.slabs) slab(...s);   // south, west, east
  const WALLS = [0x9aa3ad, 0xb8855f, 0x7f8a94, 0xc9b79c, 0x8a6f5a];
  const ROOFS = [0xb5533c, 0x4f8fa3, 0x9aa3ad, 0xc98a4b, 0x6fa36b];   // seen from above, the roofs are what the player sees
  for (const { x, z, w, d, h: hgt, wall, roof: top, vx, vz } of layout.buildings) {
    const body = box(w, hgt, d, WALLS[wall]); body.position.set(x, hgt / 2, z); g.add(body);
    const roof = box(w + 0.3, 0.25, d + 0.3, ROOFS[top]); roof.position.set(x, hgt + 0.12, z); g.add(roof);
    const vent = box(0.9, 0.5, 0.9, 0xe3e7ea); vent.position.set(vx, hgt + 0.5, vz); g.add(vent);
    for (let y = 1.2; y < hgt - 0.6; y += 1.5) {   // rows of lit windows on the side facing the yards
      const lights = lit(box(w * 0.7, 0.45, 0.08, 0xffe9a8, { map: null }), 0xffd27a, 0.3); lights.position.set(x, y, z - d / 2 - 0.03); g.add(lights);
    }
  }
  for (const [x, z] of layout.chimneys) {   // chimneys at the two far corners
    for (let i = 0; i < 6; i++) { const ring = cyl(0.85 - i * 0.05, 0.9 - i * 0.05, 1.6, i % 2 ? 0xf2f2f2 : 0xd4483b, 12); ring.position.set(x, 0.8 + i * 1.6, z); g.add(ring); }
    CITY_STACKS.push({ x, y: 9.8, z });
  }
  return g;
}
