// The fence around a yard, in the kind its look asks for (js/data/looks.js): wooden rails, white
// pickets, a stone or brick wall, iron railings, wire mesh, or glass panels. A fence is only looked at:
// what stops the player is the edge of the yard, whatever stands on it.
import * as THREE from 'three';
import { box, mat, METAL } from './world.js';
import { wood, wall, chainLink } from './textures.js';

// post: a post every `every` metres (w wide, h high, d deep if not square). rails: [height, thickness, depth].
// wall and cap: a low wall with a coping on top. panel: a sheet between the posts.
const KINDS = {
  rail:   { post: { w: 0.35, h: 1.1, color: 0x8b4a24, wood: true }, every: 2, rails: [[0.35, 0.18, 0.14], [0.8, 0.18, 0.14]], rail: { color: 0xa35a2c, wood: true } },
  picket: { post: { w: 0.16, h: 1.05, d: 0.06, color: 0xf3efe6 }, every: 0.42, rails: [[0.3, 0.1, 0.05], [0.76, 0.1, 0.05]], rail: { color: 0xe6e0d2 } },
  stone:  { post: { w: 0.62, h: 1.0, color: 0xa3a5a1 }, every: 4, wall: { h: 0.74, d: 0.52, color: 0xb6b8b3, kind: 'stone', per: 1.5 }, cap: { h: 0.12, d: 0.66, color: 0x8f918d } },
  brick:  { post: { w: 0.5, h: 1.16, color: 0xa64b33 }, every: 4, wall: { h: 0.9, d: 0.36, color: 0xb9573b, kind: 'brick', per: 1.3 }, cap: { h: 0.1, d: 0.48, color: 0xd9cdb8 } },
  iron:   { post: { w: 0.09, h: 1.3, color: 0x2b2f36, metal: true }, every: 0.5, rails: [[0.22, 0.07, 0.07], [1.12, 0.07, 0.07]], rail: { color: 0x2b2f36, metal: true } },
  mesh:   { post: { w: 0.12, h: 1.75, color: 0x9aa3ad, metal: true }, every: 2.5, rails: [[1.7, 0.08, 0.08]], rail: { color: 0x9aa3ad, metal: true }, panel: { h: 1.6, kind: 'mesh' } },
  glass:  { post: { w: 0.14, h: 1.25, color: 0xd7dce1, metal: true }, every: 2.5, rails: [[1.22, 0.07, 0.1]], rail: { color: 0xd7dce1, metal: true }, panel: { h: 1.12, kind: 'glass' } },
};
const METALLIC = ['iron', 'mesh', 'glass'];

/** The paint of a gate that fits the fence it stands in: wood in a wooden or walled fence, steel in a metal one. */
export function gatePaint(kind) {
  return METALLIC.includes(kind) ? { plank: 0x7d858e, frame: 0x4a4f57, extra: { ...METAL, map: null } } : { plank: 0xa35a2c, frame: 0x8b4a24, extra: undefined };
}

/**
 * Build the fence along `runs` ([x1, z1, x2, z2] each) into `group`.
 * @param kind  one of the kinds above; an unknown one gives wooden rails
 */
export function buildFence(group, runs, kind) {
  const k = KINDS[kind] || KINDS.rail, posts = [];
  const surface = spec => (spec.metal ? { ...METAL, map: null } : spec.wood ? wood({ upright: true }) : {});
  for (const [x1, z1, x2, z2] of runs) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.2) continue;
    const ang = Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const n = Math.max(1, Math.round(len / k.every));
    for (let i = 0; i <= n; i++) { const t = i / n; posts.push([x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, ang]); }
    const along = (mesh, y) => { mesh.position.set(cx, y, cz); mesh.rotation.y = -ang; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
    for (const [y, h, d] of k.rails || []) {
      // wooden rails carry their grain along the rail, repeated so that it does not stretch
      const material = mat(k.rail.color, k.rail.metal ? { ...METAL } : k.rail.wood ? wood({ rx: Math.max(1, len / 4) }) : {});
      along(new THREE.Mesh(new THREE.BoxGeometry(len, h, d), material), y);
    }
    if (k.wall) {
      along(box(len, k.wall.h, k.wall.d, k.wall.color, wall(k.wall.kind, Math.max(1, len / k.wall.per))), k.wall.h / 2);
      along(box(len, k.cap.h, k.cap.d, k.cap.color), k.wall.h + k.cap.h / 2);
    }
    if (k.panel) {
      const sheet = k.panel.kind === 'mesh'
        ? mat(0xc3c9cf, { alphaMap: chainLink(len / 0.5, k.panel.h / 0.5), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45 })
        : mat(0xbfe6ff, { transparent: true, opacity: 0.24, side: THREE.DoubleSide, roughness: 0.05, metalness: 0.3, envMapIntensity: 1, depthWrite: false });
      const pane = along(new THREE.Mesh(new THREE.PlaneGeometry(len, k.panel.h), sheet), k.panel.h / 2 + 0.08);
      pane.castShadow = k.panel.kind === 'mesh';   // glass throws no shadow worth drawing
    }
  }
  if (posts.length) {
    const p = k.post, geo = new THREE.BoxGeometry(p.d ? p.w : p.w, p.h, p.d || p.w);
    const inst = new THREE.InstancedMesh(geo, mat(p.color, surface(p)), posts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    posts.forEach(([x, z, ang], i) => { inst.setMatrixAt(i, m.compose(at.set(x, p.h / 2, z), q.setFromAxisAngle(up, -ang), one)); });
    inst.castShadow = true; inst.receiveShadow = true; group.add(inst);
  }
}
