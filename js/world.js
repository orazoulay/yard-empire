// Scene, lights, ground, trees and the follow camera.
import * as THREE from 'three';

import { bark, edge, grass, rings } from './textures.js';
import { mulberry, offRects, edgeYards } from './sim/site.js';
import { makeCityEdge } from './gfx/cityedge.js';
import { cameraFrame } from './sim/yard.js';
import { sharedMaterial, boxShape, cylinderShape, glowing } from './engine/materials.js';
import { bake } from './engine/bake.js';
import { AREAS } from './data/areas.js';
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
/**
 * The shared material a block of this colour and finish is made of (the one box() gives it): for something whose
 * surface is swapped for another while the game runs, such as a truck's cab in another paint. A shared material is
 * never changed; the part is handed a different one.
 */
export const paintOf = (color, extra = {}) => part(color, { map: edgeMap || (edgeMap = edge()), ...extra });
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
/** Take a ground material off that list again: the floor it was on has been laid anew (js/area.js, setFloor). */
export function dries(material) {
  const i = WET.indexOf(material);
  if (i >= 0) WET.splice(i, 1);
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

// ------------------------------------------------------------------------------------------ the coast
/** The level of the sea, a little below the land: the beach goes down to it, and a quay stands up out of it. */
export const SEA_LEVEL = -0.3;
/** The level of a quay's stone: the Port's wall along the water, and its deck (js/gfx/harbour.js). */
export const QUAY_TOP = 0.22;
const WALL = 0.95;   // how far the Port's wall reaches out from its fence line: the deck reaches a metre (js/gfx/harbour.js)
/** The Port's front on the water, from the data: from its west to its east fence, and where its quay stands. */
const PORT_YARD = AREAS.find(a => a.stations.some(s => s.type === 'quay'));
const HARBOUR = PORT_YARD ? { minX: PORT_YARD.bounds.minX, maxX: PORT_YARD.bounds.maxX, quayX: PORT_YARD.stations.find(s => s.type === 'quay').x } : null;
const SAND = 0xe8cd8e, WET_SAND = 0xc4a266, FOAM = 0xf2fbff, SURF = 0xa6e2e6, SHALLOW = 0x4fc0cf, MID = 0x3299cb, DEEP = 0x2a78b2;

/** Where a beach meets the water at x: a long gentle wave. The water deepens from this line out, also off the Port's wall. */
const beachLine = (x, seaZ) => seaZ + 2.3 + 0.55 * Math.sin(x * 0.19 + 0.7) + 0.3 * Math.sin(x * 0.47 + 2.1);
/**
 * Where the water's edge lies at x: straight along the Port's wall, the beach's line elsewhere, and in between a small
 * cove where the sand curves in to meet the end of the wall.
 */
export function waterline(x, seaZ, harbour = HARBOUR) {
  const off = harbour ? Math.max(harbour.minX - x, x - harbour.maxX) : Infinity, BEND = 3.5;
  if (off <= 0) return seaZ + WALL;
  if (off >= BEND) return beachLine(x, seaZ);
  const t = off / BEND;
  return seaZ + WALL + (beachLine(x, seaZ) - seaZ - WALL) * t * t * (3 - 2 * t);
}
/** Where the sand begins at x: a ragged edge in the grass rather than a ruler's line. Under a yard's floor it does not show. */
const sandEdge = (x, seaZ) => seaZ - 0.2 - 0.45 * (1 + Math.sin(x * 0.29 + 1.3)) - 0.2 * (1 + Math.sin(x * 0.83));

/**
 * The coast south of the coast row: a beach with a ragged edge in the grass, wet sand, a line of foam and a second of
 * surf, shallow water that deepens to the sea; along the Port's front a stone wall with bollards instead, the water at
 * its foot; rocks along the water and heaped at the wall's ends, and tufts of dune grass at the foot of the fences.
 * Nothing moves. Colours are kept in the shapes' corners. The coast is cut into stretches of CHUNK metres, each a mesh
 * of sand, rocks and grass and a mesh of the water near it, so that only the stretches in sight are drawn; the open sea
 * beyond is one flat sheet, and the wall is joined into a mesh of its own.
 * @param map      the yards' extent  @param seaZ  where the land of the coast row ends (its fences)
 * @param harbour  { minX, maxX, quayX }: the Port's front, or null
 */
export function makeCoast(map, seaZ, harbour = HARBOUR) {
  const group = new THREE.Group(), cx = (map.minX + map.maxX) / 2, from = map.minX - 44, to = map.maxX + 44, CHUNK = 26, STEP = 1.2;
  const c = new THREE.Color(), mix = new THREE.Color();
  const tone = (hex, other = hex, k = 0) => { c.setHex(hex); mix.setHex(other); return [c.r + (mix.r - c.r) * k, c.g + (mix.g - c.g) * k, c.b + (mix.b - c.b) * k]; };
  const onWall = x => harbour && x >= harbour.minX && x <= harbour.maxX;
  const FAR = 13;   // the near water reaches this far beyond the beach's line; the open sea lies beyond
  /** The rows of the beach and of the near water at x, from the land out: [z, y, [r, g, b]]. */
  const rows = x => {
    const w = waterline(x, seaZ, harbour), b = beachLine(x, seaZ);
    // the line of surf off a beach fades out over a few metres in front of the wall, where the water is calm
    const surf = harbour ? Math.min(1, Math.max(0, harbour.minX - x, x - harbour.maxX) / 4) : 1;
    const beach = [[sandEdge(x, seaZ), 0.004, tone(SAND)], [seaZ + 0.25, 0.006, tone(SAND)], [w - 0.8, -0.1, tone(SAND)], [w - 0.3, SEA_LEVEL + 0.06, tone(WET_SAND)], [w, SEA_LEVEL + 0.005, tone(WET_SAND)]];
    const water = [[w, SEA_LEVEL, tone(FOAM)], [w + (onWall(x) ? 0.18 : 0.3), SEA_LEVEL, tone(FOAM, SHALLOW, 0.35)], [w + 0.9, SEA_LEVEL, tone(SHALLOW)],
      [Math.max(w + 1.7, b + 1.7), SEA_LEVEL, tone(SHALLOW)], [b + 2.0, SEA_LEVEL, tone(SHALLOW, SURF, surf)], [b + 2.35, SEA_LEVEL, tone(SHALLOW)], [b + 5, SEA_LEVEL, tone(MID)], [b + FAR, SEA_LEVEL, tone(DEEP)]];
    for (const list of [beach, water]) for (let i = 1; i < list.length; i++) list[i][0] = Math.max(list[i][0], list[i - 1][0] + 0.02);   // always outward
    return [beach, water];
  };
  /** A mesh of triangles from flat lists, every corner with its own colour and normal. */
  const sheet = (pos, nor, col, material, name) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, material); m.receiveShadow = true; m.name = name; group.add(m);
    return m;
  };
  /** The quads between the rows of neighbouring columns, as triangles facing up, into `out` ({ pos, nor, col }). */
  const strip = (xs, lines, out) => {
    for (let i = 0; i + 1 < xs.length; i++) for (let k = 0; k + 1 < lines[i].length; k++) {
      const corner = (j, r) => { const [z, y, rgb] = lines[j][r]; out.pos.push(xs[j], y, z); out.nor.push(0, 1, 0); out.col.push(...rgb); };
      corner(i, k); corner(i, k + 1); corner(i + 1, k); corner(i + 1, k); corner(i, k + 1); corner(i + 1, k + 1);
    }
  };
  // rocks and tufts, placed once from a run of numbers of their own; each is put into the stretch it stands in
  const rnd = mulberry(41), rocks = [], tufts = [], near = x => harbour && x > harbour.minX - 1.2 && x < harbour.maxX + 1.2;
  for (let i = 0; i < 40; i++) {   // along the water: some on the wet sand, some half in the water
    const x = from + 6 + rnd() * (to - from - 12), w = waterline(x, seaZ, harbour), k = 0.25 + rnd() * 0.5, turn = rnd(), z = w - 0.5 + rnd() * 1.6;
    if (!near(x)) rocks.push([x, z, k, turn]);
  }
  if (harbour) for (const end of [harbour.minX, harbour.maxX]) {   // the stones heaped against the ends of the wall
    const out = end === harbour.minX ? -1 : 1;
    for (let i = 0; i < 10; i++) rocks.push([end + out * (0.2 + rnd() * 1.7), seaZ + 0.3 + rnd() * 2.6, 0.35 + rnd() * 0.4, rnd()]);
  }
  for (let i = 0; i < 60; i++) {   // dune grass at the foot of the fences and the forest, outside the yards
    const x = from + 4 + rnd() * (to - from - 8), z = seaZ + 0.2 + rnd() * 0.9, k = 0.7 + rnd() * 0.6, turn = rnd();
    if (!near(x)) tufts.push([x, z, k, turn]);
  }
  const ROCK = new THREE.DodecahedronGeometry(1, 0), BLADE = new THREE.ConeGeometry(0.15, 0.55, 4).translate(0, 0.27, 0).toNonIndexed();
  const GREYS = [0x8d9294, 0x9da2a3, 0x7c8183, 0xa59d8f], GREENS = [0x9db556, 0x86a24a, 0xb5c06a];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), n = new THREE.Vector3();
  /** One copy of a shape, placed by m4, in one colour and with the flat normals of its faces, into `out`. */
  const solid = (geo, rgb, out) => {
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i += 3) {
      va.fromBufferAttribute(P, i).applyMatrix4(m4); vb.fromBufferAttribute(P, i + 1).applyMatrix4(m4); vc.fromBufferAttribute(P, i + 2).applyMatrix4(m4);
      n.subVectors(vb, va).cross(vc.clone().sub(va)).normalize();
      for (const v of [va, vb, vc]) { out.pos.push(v.x, v.y, v.z); out.nor.push(n.x, n.y, n.z); out.col.push(...rgb); }
    }
  };
  const sand = soaks(mat(0xffffff, { vertexColors: true, roughness: 0.95 }));
  const glassy = mat(0xffffff, { vertexColors: true, roughness: 0.35, envMapIntensity: 0.55 });   // the water: smoother than the sand, and it mirrors the sky a little
  const edges = [cx - 350];
  for (let x = from; x < to - 1; x += CHUNK) edges.push(x);
  edges.push(to, cx + 350);
  for (let i = 0; i + 1 < edges.length; i++) {
    const x0 = edges[i], x1 = edges[i + 1], fine = x0 >= from - 1e-6 && x1 <= to + 1e-6, xs = [];
    if (fine) for (let x = x0; x < x1 - 1e-6; x += STEP) xs.push(x);
    else xs.push(x0);
    xs.push(x1);
    if (harbour) for (const x of [harbour.minX, harbour.maxX]) if (x > x0 && x < x1) xs.push(x);
    xs.sort((a, b) => a - b);
    const lines = xs.map(rows), land = { pos: [], nor: [], col: [] }, sea = { pos: [], nor: [], col: [] };
    strip(xs, lines.map(l => l[0]), land);
    strip(xs, lines.map(l => l[1]), sea);
    for (const [x, z, k, turn] of rocks) {
      if (x < x0 || x >= x1) continue;
      const y = (z < waterline(x, seaZ, harbour) - 0.4 ? -0.05 : SEA_LEVEL) + k * 0.15;
      m4.compose(p.set(x, y, z), q.setFromEuler(e.set(turn * 2, turn * 9, turn)), sc.set(k * 1.3, k * (0.55 + turn * 0.3), k));
      solid(ROCK, tone(GREYS[Math.floor(turn * GREYS.length * 0.999)]), land);
    }
    tufts.forEach(([x, z, k, turn], t) => {
      if (x < x0 || x >= x1) return;
      for (let b = 0; b < 3; b++) {
        const a = turn * 6.28 + b * 2.1;
        m4.compose(p.set(x + Math.cos(a) * 0.14 * k, 0, z + Math.sin(a) * 0.1 * k), q.setFromEuler(e.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)), sc.setScalar(k * (0.8 + b * 0.15)));
        solid(BLADE, tone(GREENS[(t + b) % 3]), land);
      }
    });
    sheet(land.pos, land.nor, land.col, sand, 'beach');
    sheet(sea.pos, sea.nor, sea.col, glassy, 'sea');
  }
  // the open sea beyond the near water: one sheet, a hair lower, so that the near water is drawn where the two meet
  const deep = tone(DEEP), z0 = seaZ + 2.3 - 0.85 + FAR - 0.6, z1 = seaZ + 330, open = { pos: [], nor: [], col: [] };
  strip([cx - 350, cx + 350], [[[z0, SEA_LEVEL - 0.004, deep], [z1, SEA_LEVEL - 0.004, deep]], [[z0, SEA_LEVEL - 0.004, deep], [z1, SEA_LEVEL - 0.004, deep]]], open);
  sheet(open.pos, open.nor, open.col, glassy, 'open sea');

  if (harbour) {   // the Port's wall: stone from the sea bed to the quay's level, a coping along its edge, bollards on it
    const wall = new THREE.Group(), w = harbour.maxX - harbour.minX, mid = (harbour.minX + harbour.maxX) / 2;
    const add = (m, x, y, z) => { m.position.set(x, y, z); wall.add(m); return m; };
    add(box(w, QUAY_TOP - SEA_LEVEL + 0.3, WALL, 0x9e978b), mid, (QUAY_TOP + SEA_LEVEL - 0.3) / 2, seaZ + WALL / 2);
    add(box(w, 0.08, 0.3, 0x857e73), mid, QUAY_TOP + 0.04, seaZ + WALL - 0.15);
    add(box(w + 0.02, 0.12, 0.06, 0x857e73), mid, SEA_LEVEL + 0.1, seaZ + WALL);
    for (let x = harbour.minX + 1.5; x < harbour.maxX - 1; x += 3.2) {
      if (Math.abs(x - harbour.quayX) < 7) continue;   // the quay's deck has its own
      add(cyl(0.13, 0.15, 0.32, 0x272b31), x, QUAY_TOP + 0.16, seaZ + 0.45);
      add(cyl(0.19, 0.19, 0.07, 0x272b31), x, QUAY_TOP + 0.34, seaZ + 0.45);
    }
    bake(wall); wall.name = 'harbour wall'; group.add(wall);
  }
  return group;
}

/** The share of each list of undergrowth and flowers the low graphics level draws: the first part of it (setDetail). */
export const LOW_SHARE = 0.4;
/**
 * `old` with `more` worked in, so that the low graphics level, which draws the first LOW_SHARE of the list, draws the
 * same entries of `old` as it did without `more` and about the same share of `more`.
 * @param per  how many instances each entry makes (a flower: three heads)
 */
export function lowFirst(old, more, per = 1) {
  if (!more.length) return old;
  const whole = Math.ceil(Math.ceil(old.length * per * LOW_SHARE) / per);   // the old entries the low level draws, whole
  const drawn = Math.ceil((old.length + more.length) * per * LOW_SHARE);   // how many instances it will draw
  const k = Math.max(0, Math.min(more.length, Math.ceil((drawn - whole * per) / per)));
  return [...old.slice(0, whole), ...more.slice(0, k), ...old.slice(whole), ...more.slice(k)];
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
 * @param areaRects  the yards: nothing of the forest grows on them. Those flagged `city` are built-up land: the forest
 *                   keeps further away, and the city's edge goes around those of them that have one (edgeYards, js/sim/site.js)
 * @param clear      more ground to keep free of trees and of the city's buildings (the building site's plot)
 * @param o          seaZ: where the sea begins (south of the coast row), or null for none: nothing grows from two metres
 *                   before it on; south: false when the coast row lies along the city's south side (no street there);
 *                   harbour: the Port's front on the water, where a stone wall stands instead of a beach (makeCoast)
 */
export function createWorld(areaRects, clear = [], { seaZ = null, south = true, harbour = HARBOUR } = {}) {
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
  // The grass reaches as far as the land does: with a sea, it ends just past the coast row's fences, where the beach
  // goes down to the water (makeCoast), so that the water can lie below it.
  const cz = (map.minZ + map.maxZ) / 2, grassEnd = seaZ == null ? cz + 350 : seaZ + 0.2, deep = grassEnd - (cz - 350);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, deep), soaks(mat(0xffffff, { ...grass(88, 88 * deep / 700), roughness: 0.95 })));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  ground.position.set((map.minX + map.maxX) / 2, 0, grassEnd - deep / 2); scene.add(ground);

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
  // The coast row has no street or buildings of the city's edge around it (edgeYards, js/sim/site.js), so beside its two
  // ends the forest grows again to a few metres from the fences, as around a yard of Lumber Town, down to the beach.
  // It is drawn from runs of numbers of its own and added after the rest, so every other tree, bush and flower stays
  // where it always was; with no coast row nothing is added.
  const edged = edgeYards(areaRects.filter(r => r.city)), row = areaRects.filter(r => r.city && !edged.includes(r));
  const rowBox = seaZ != null && row.length ? { minX: Math.min(...row.map(r => r.minX)), maxX: Math.max(...row.map(r => r.maxX)), minZ: Math.min(...row.map(r => r.minZ)) } : null;
  const scatter = (map.maxX - map.minX + 2 * M) * (map.maxZ - map.minZ + 2 * M);   // the ground the forest is scattered over
  /** About as many as the forest has on the same ground, in the strips beside the row's ends that the city's margin kept bare. */
  const flanks = (n, gap, seed, make) => {
    if (!rowBox) return;
    const r = mulberry(seed), z0 = rowBox.minZ + gap, z1 = seaZ - 2;
    for (const [x0, x1] of [[rowBox.minX - 13, rowBox.minX - gap], [rowBox.maxX + gap, rowBox.maxX + 13]]) {
      const count = Math.round(n * (x1 - x0) * (z1 - z0) / scatter);
      for (let i = 0; i < count; i++) make(x0 + r() * (x1 - x0), z0 + r() * (z1 - z0), r);
    }
  };
  flanks(900, 2.5, 83, (x, z, r) => {
    const tree = [x, z, 0.8 + r() * 0.6, r()], far = Math.hypot(x - homeX, z - homeZ);
    (far > 34 && r() > 1 - Math.min(0.55, 0.2 + (far - 34) / 90) ? rounds : pines).push(tree);
  });
  // Ground kept free for something else (the building site's plot), and the beach and the sea: what fell there is taken
  // out afterwards, so that every other tree, bush and flower stays where it always was.
  const land = list => (seaZ == null ? list : list.filter(p => p[1] <= seaZ - 2));
  scene.add(makeTrees(land(offRects(pines, clear))), makeRoundTrees(land(offRects(rounds, clear))), makeStumps(land(offRects(stumps, clear))));
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
  const flankBushes = [], flankStones = [], flankFlowers = [];
  flanks(1500, 1.2, 89, (x, z, r) => (r() < 0.72 ? flankBushes : flankStones).push([x, z, 0.5 + r() * 0.8, r()]));
  flanks(620, 0.9, 97, (x, z, r) => flankFlowers.push([x, z, 0.7 + r() * 0.7, r()]));
  const kept = list => land(offRects(list, clear));
  const undergrowth = makeUndergrowth(lowFirst(land(offRects(bushes, clear)), kept(flankBushes)), lowFirst(land(offRects(stones, clear)), kept(flankStones)));
  const blossom = makeFlowers(lowFirst(land(offRects(flowers, clear)), kept(flankFlowers), 3));
  scene.add(undergrowth, blossom);
  if (seaZ != null) scene.add(makeCoast(map, seaZ, harbour));   // the beach, the harbour wall and the sea south of the coast row
  const city = areaRects.filter(r => r.city);
  const cityRim = city.length ? makeCityEdge(city, clear, { south }) : null;
  if (cityRim) scene.add(cityRim);
  const edgeCasters = [];   // the joined buildings and street furniture of the city's edge that throw shadows (named 'city-still' in js/gfx/cityedge.js)
  cityRim?.traverse(m => { if (m.name === 'city-still') edgeCasters.push(m); });
  // What the low graphics level thins out. The instances were placed at random, so drawing only the
  // first part of each list thins evenly; nothing is rebuilt, and the full count comes back the same way.
  const thinned = [...undergrowth.children, blossom].map(mesh => ({ mesh, full: mesh.count }));
  function setDetail(low) {
    for (const t of thinned) { t.mesh.count = low ? Math.ceil(t.full * LOW_SHARE) : t.full; t.mesh.castShadow = !low && t.mesh !== blossom; }
    for (const m of edgeCasters) m.castShadow = !low;   // like the yards' own dressing: on Low the city's edge throws no shadows
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
    // Not for the small zoom of the camera's own moves, or the shadows would shimmer with every step. Not past twice
    // the usual either: from above (js/game/overview.js) they cover the middle of the picture, and what lies further
    // is drawn lit, so the shadow pass draws no more than it does at the usual limit's distance.
    const half = zoom > 1.12 ? 32 * Math.min(zoom, 2) : 32;
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
