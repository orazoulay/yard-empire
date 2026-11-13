// Two tools for drawing many small things cheaply.
//   merge(): a shape built from several parts, each in its own colour, becomes ONE mesh. A car with
//            wheels and windows then costs the same to draw as a plain block.
//   Batch:   many copies of one shape, anywhere on the map, are drawn together in one go.
import * as THREE from 'three';
import { mat } from './world.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** A block as a part for merge(). at = [x, y, z] of its middle, turn = [rx, ry, rz]. */
export const blockPart = (w, h, d, color, at = [0, 0, 0], turn = [0, 0, 0]) => ({ geo: new THREE.BoxGeometry(w, h, d), color, at, turn });
/** A cylinder (or a cone, with one radius 0) as a part for merge(): upright unless turned. */
export const roundPart = (rt, rb, h, color, at = [0, 0, 0], turn = [0, 0, 0], seg = 10) => ({ geo: new THREE.CylinderGeometry(rt, rb, h, seg), color, at, turn });

/**
 * One shape out of several parts. The colour of each part is stored in the shape itself, so the
 * material that draws it must be made with `vertexColors` (see solid() below).
 * @param parts  [{ geo, color, at: [x, y, z], turn: [rx, ry, rz], scale: number | [sx, sy, sz] }]
 */
export function merge(parts) {
  const pos = [], nor = [], uv = [], col = [];
  for (const { geo, color = 0xffffff, at = [0, 0, 0], turn = [0, 0, 0], scale = 1 } of parts) {
    const sc = typeof scale === 'number' ? [scale, scale, scale] : scale;
    _m.compose(_p.set(at[0], at[1], at[2]), _q.setFromEuler(_e.set(turn[0], turn[1], turn[2])), _s.set(sc[0], sc[1], sc[2]));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(_m);   // a copy: shapes handed in may be shared
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    _c.set(color);
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      col.push(_c.r, _c.g, _c.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/** The material for a merged shape: white, so that the colours of the parts show as they are. */
export const solid = (extra = {}) => mat(0xffffff, { vertexColors: true, ...extra });

/** A colour made darker (k below 1) or lighter (above 1), as a number. */
export const shade = (hex, k) => _c.set(hex).multiplyScalar(k).getHex();

/**
 * Many copies of one shape drawn together. Copies are only ever added (the things they are used for,
 * such as lamps and pallets, stay for as long as the game runs), up to `capacity`.
 */
export class Batch {
  /** @param tinted  true when copies are given colours of their own (then every copy has one, white unless said) */
  constructor(scene, geo, material, capacity, { cast = true, receive = true, tinted = false } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, material, capacity);
    this.mesh.count = 0; this.capacity = capacity; this.tinted = tinted;
    this.mesh.frustumCulled = false;   // its copies are spread over the whole map
    this.mesh.castShadow = cast; this.mesh.receiveShadow = receive;
    scene.add(this.mesh);
  }
  /**
   * @param o  { turn: around the upright axis, sx, sy, sz: size (sy and sz default to sx), color: tint }
   * @returns the number of the copy, or -1 when the batch is full
   */
  add(x, y, z, { turn = 0, sx = 1, sy = sx, sz = sx, color = null } = {}) {
    if (this.mesh.count >= this.capacity) return -1;
    const i = this.mesh.count++;
    this.mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, turn, 0)), _s.set(sx, sy, sz)));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.tinted) { this.mesh.setColorAt(i, _c.set(color ?? 0xffffff)); this.mesh.instanceColor.needsUpdate = true; }
    return i;
  }
}
