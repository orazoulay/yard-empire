// @ts-check
// Static batching: the parts of a model that never move are joined into as few meshes as their materials allow.
//
// A machine, a shop or a truck is built in code from dozens of small blocks and cylinders, which is how it is easy to
// design. Drawn like that, every block costs the renderer its own work on every frame, and once more for the shadow.
// bake() walks a finished model and joins every part that does not move into one mesh per kind of surface: parts that
// differ only in colour are joined too, their colours kept in the shape itself (vertex colours on a white material).
// What moves, glows, fades or is changed later is left as it is.
//
// What is never joined, so that nothing changes behaviour:
//   - anything under a part marked userData.moving (blades, hammers, wheels, lamps that change colour);
//   - materials that are not shared (they may be changed at run time), glowing, see-through or textured per object;
//   - instanced meshes, points and sprites.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _n = new THREE.Matrix3(), _c = new THREE.Color();
const tinted = new Map();   // material key without its colour -> the white material that shows vertex colours

/** Mark parts that move, so that bake() leaves them (and everything under them) alone. Returns the first part. */
export function moving(...parts) { for (const p of parts) if (p) p.userData.moving = true; return parts[0]; }

/** The material that draws the joined parts of one kind of surface: the same, white, showing the colour kept in each part. */
function tintedTwin(material) {
  const key = material.userData.key.replace(/(^|;)color=[^;]*/, '') + '|vc';
  let m = tinted.get(key);
  if (!m) {
    m = material.clone(); m.color.setHex(0xffffff); m.vertexColors = true;
    m.userData = { shared: true, key };
    tinted.set(key, m);
  }
  return m;
}

/** True when this mesh may be joined with others: still, shared, plain, and not moved or changed by anyone. */
function joinable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) return false;
  const m = o.material;
  if (!m.isMeshStandardMaterial || !m.userData?.shared || !m.userData.key || m.userData.glowing || m.transparent || m.vertexColors) return false;
  if (o.morphTargetInfluences || o.geometry.morphAttributes?.position) return false;
  if (!o.geometry.attributes.normal || !o.geometry.attributes.position) return false;
  return o.visible;
}

/**
 * Join the still parts of `root` (a model built in code) into one mesh per kind of surface and shadow setting.
 * @returns how many meshes were joined, and how many were made of them
 */
export function bake(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map(), take = [];
  const visit = o => {
    if (o !== root && o.userData.moving) return;   // it and everything on it stay as they are
    if (o !== root && joinable(o)) {
      const m = o.material, key = m.userData.key.replace(/(^|;)color=[^;]*/, '') + `|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
      if (!groups.has(key)) groups.set(key, { material: m, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, parts: [] });
      groups.get(key).parts.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  let joined = 0, made = 0;
  for (const g of groups.values()) {
    if (g.parts.length < 2) continue;   // one part alone is already one draw
    const geo = joinParts(g.parts);
    const mesh = new THREE.Mesh(geo, tintedTwin(g.material));
    mesh.castShadow = g.cast; mesh.receiveShadow = g.receive; mesh.renderOrder = g.order;
    mesh.name = 'baked'; mesh.userData.baked = g.parts.length;
    root.add(mesh);
    let start = 0;   // each part remembers where it went, so its colour can be changed later (paint())
    for (const p of g.parts) { const n = p.geometry.attributes.position.count; p.userData.bakedInto = { mesh, start, count: n }; start += n; take.push(p); }
    joined += g.parts.length; made++;
  }
  // The joined parts leave. A part that others hang from (a group's child mesh) keeps its children: they are moved
  // up to its parent, where they sit as before, so a moving piece under a still one is not lost.
  for (const p of take) {
    const parent = p.parent;
    for (const c of [...p.children]) { parent.attach(c); }
    parent.remove(p);
  }
  return { joined, made };
}

/** One geometry out of several meshes, placed where they stand under the root, each in its material's colour. */
function joinParts(parts) {
  let count = 0, indexed = 0;
  for (const p of parts) { count += p.geometry.attributes.position.count; indexed += p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count; }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2), col = new Float32Array(count * 3);
  const index = new (count > 65535 ? Uint32Array : Uint16Array)(indexed);
  let v = 0, i = 0;
  for (const p of parts) {
    const geo = p.geometry, P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    _m.multiplyMatrices(_inv, p.matrixWorld); _n.getNormalMatrix(_m);
    _c.copy(p.material.color);
    const e = _m.elements, ne = _n.elements;
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), y = P.getY(k), z = P.getZ(k);
      pos[(v + k) * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[(v + k) * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[(v + k) * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = N.getX(k), ny = N.getY(k), nz = N.getZ(k);
      let ax = ne[0] * nx + ne[3] * ny + ne[6] * nz, ay = ne[1] * nx + ne[4] * ny + ne[7] * nz, az = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const len = Math.hypot(ax, ay, az) || 1; ax /= len; ay /= len; az /= len;
      nor[(v + k) * 3] = ax; nor[(v + k) * 3 + 1] = ay; nor[(v + k) * 3 + 2] = az;
      if (U) { uv[(v + k) * 2] = U.getX(k); uv[(v + k) * 2 + 1] = U.getY(k); }
      col[(v + k) * 3] = _c.r; col[(v + k) * 3 + 1] = _c.g; col[(v + k) * 3 + 2] = _c.b;
    }
    // a mirrored part (a negative scale) turns its faces inside out: their order is turned back
    const flip = _m.determinant() < 0;
    if (geo.index) {
      const I = geo.index.array;
      for (let k = 0; k < I.length; k += 3) {
        index[i++] = I[k] + v;
        index[i++] = (flip ? I[k + 2] : I[k + 1]) + v;
        index[i++] = (flip ? I[k + 1] : I[k + 2]) + v;
      }
    } else {
      for (let k = 0; k < P.count; k += 3) { index[i++] = v + k; index[i++] = v + (flip ? k + 2 : k + 1); index[i++] = v + (flip ? k + 1 : k + 2); }
    }
    v += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

const _paint = new THREE.Color();
/**
 * Give a part that was joined by bake() another colour, in the joined shape itself: the player's outfit, bought with
 * credits. A part that was not joined has its own material changed instead (it is never a shared one: see dress()).
 */
export function paint(part, hex) {
  const b = part.userData.bakedInto;
  if (!b) { part.material.color.setHex(hex); return; }
  const col = b.mesh.geometry.attributes.color;
  _paint.setHex(hex);
  for (let i = b.start; i < b.start + b.count; i++) col.setXYZ(i, _paint.r, _paint.g, _paint.b);
  col.needsUpdate = true;
}
