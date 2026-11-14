// What dresses the yards: the things along the fences (log decks, bread carts, pipe racks, neon signs…) and the paint
// on the floor. js/sim/dressing.js decides what stands where, as plain numbers; this file knows what each thing looks
// like and joins a whole yard's worth of them into two meshes:
//   - the still things and the paint on the floor: one mesh, every colour kept in the shape itself, and a "metal"
//     share per corner so that steel and painted wood can live in the same mesh;
//   - whatever glows after dark or moves in the wind (lanterns, neon, flags, vents, beacons): one small mesh whose
//     material does the moving on the graphics chip, from the same `wind` the trees sway by. Nothing here runs per frame.
// So a yard's dressing costs two draws (and one more in the shadow pass) however many things stand in it, and a
// yard that is out of sight costs none. The two materials are shared by every yard and never changed afterwards.
//
// A thing is drawn by a function in MODELS, in its own space: x along the fence (the middle of its length at 0), y up,
// z into the yard from its back at 0. The helpers below add one part each; a part that is given `glow`, `sway` or
// `spin` goes to the moving mesh, everything else to the still one.
import * as THREE from 'three';
import { GLOW, mat, wind } from '../world.js';

/** 1 while flags fly, vents turn and beacons blink; 0 holds them still (the low graphics level, less motion). */
export const life = { value: 1 };

// ------------------------------------------------------------------------------------------ materials
let made = null;
function materials() {
  if (made) return made;
  const still = mat(0xffffff, { vertexColors: true, roughness: 0.84, envMapIntensity: 0.6 });
  still.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float metal;\nvarying float vMetal;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vMetal = metal;');
    shader.fragmentShader = 'varying float vMetal;\n' + shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.32, vMetal);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, 0.6, vMetal);');   // fully metallic, it would mirror the green ground and turn olive
  };
  // What glows shines in its own colour: the glow is white in the material, and every corner's colour and glow tint it.
  const live = mat(0xffffff, { vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.3 });
  live.userData.byDay = 0.3; GLOW.push(live);
  live.onBeforeCompile = shader => {
    shader.uniforms.uWind = wind; shader.uniforms.uLife = life;
    shader.vertexShader = 'uniform float uWind;\nuniform float uLife;\nattribute vec4 fx;\nattribute vec3 pivot;\nattribute vec3 axis;\nvarying vec2 vGlow;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float lifeTurn = uWind * fx.w * uLife, lifeC = cos(lifeTurn), lifeS = sin(lifeTurn);
        if (fx.w != 0.0) objectNormal = objectNormal * lifeC + cross(axis, objectNormal) * lifeS + axis * dot(axis, objectNormal) * (1.0 - lifeC);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlow = fx.xy;
        if (fx.w != 0.0) {   // it turns about an axle
          vec3 arm = transformed - pivot;
          transformed = pivot + arm * lifeC + cross(axis, arm) * lifeS + axis * dot(axis, arm) * (1.0 - lifeC);
        } else if (fx.z > 0.0) {   // it flaps: more the further from where it is held, each in its own time
          float lifeAt = uWind * 3.1 + pivot.x * 1.7 + pivot.z * 1.3;
          transformed += axis * ((sin(lifeAt - fx.z * 2.4) * 0.6 + sin(lifeAt * 1.7 - fx.z * 4.3) * 0.3) * fx.z * 0.24 * uLife);
        }`);
    shader.fragmentShader = 'uniform float uWind;\nuniform float uLife;\nvarying vec2 vGlow;\n' + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float lifeGlow = vGlow.x;
        if (vGlow.y > 0.0) lifeGlow *= mix(1.0, step(0.5, fract(uWind * 0.75 + vGlow.y)), uLife);   // a beacon blinks
        totalEmissiveRadiance *= vColor.rgb * lifeGlow;`);
  };
  return (made = { still, live });
}

// ------------------------------------------------------------------------------------------ shapes, made once
const BOX = new THREE.BoxGeometry(1, 1, 1), ICO0 = new THREE.IcosahedronGeometry(1, 0), ICO1 = new THREE.IcosahedronGeometry(1, 1);
const DODE = new THREE.DodecahedronGeometry(1, 0), OCTA = new THREE.OctahedronGeometry(1, 0);
const cyls = new Map(), discs = new Map();
/** A cylinder one high: its radii at the top and the foot as shares of the larger one. */
function cylGeo(seg, top, foot, open) {
  const key = [seg, top.toFixed(3), foot.toFixed(3), open].join('|');
  if (!cyls.has(key)) cyls.set(key, new THREE.CylinderGeometry(top, foot, 1, seg, 1, open));
  return cyls.get(key);
}
const discGeo = seg => { if (!discs.has(seg)) discs.set(seg, new THREE.CircleGeometry(1, seg)); return discs.get(seg); };
const flat = pts => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); return g; };
const PRISM = flat([   // a roof one long, one deep and one high: the ridge runs along x, the foot lies at y = 0
  -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,       // the slope toward +z
  0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,    // the slope toward -z
  -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,   // the two gables
]);
const TRI_UP = flat([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]), TRI_DOWN = flat([0.5, 0, 0, -0.5, 0, 0, 0, -1, 0]);
const FLAG = new THREE.PlaneGeometry(1, 1, 4, 1).translate(0.5, 0, 0);

// ------------------------------------------------------------------------------------------ drawing a thing
const TINT = -1;   // in place of a colour: the colour this copy of the thing is given (js/sim/dressing.js, TINTS)
const SIZE = 1.15; // everything is drawn at its real size and stood in the yard this much larger: the people here are stocky, and a phone is small
const E = new THREE.Euler();
let S = null;      // the thing being drawn: { still: [], live: [] }

/** One part: a shape, scaled, turned (rz first, then rx, then ry) and put at (x, y, z). */
function add(geo, color, sx, sy, sz, x, y, z, o = {}) {
  E.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(E), new THREE.Vector3(sx, sy, sz));
  (o.glow != null || o.sway || o.spin ? S.live : S.still).push({ geo, color, m, o });
}
/**
 * The options every part takes:
 *   rx, ry, rz  turned by these                    m      how much of it is bare metal, 0 to 1
 *   tint        true (or a shade, 1 = as given): this part takes the colour of the copy
 *   top, cap    another colour (or TINT) for its upper face / for both ends of a rod; lid: the shade of a TINT top
 *   faceted     flat faces, like the trees
 *   glow        it shines after dark, this strongly  blink  it blinks, starting this far (0..1) into the second
 *   sway        { from: [x, y, z], dir: [x, y, z], amp }: cloth held at `from` that flaps along `dir`
 *   spin        { at: [x, y, z], axis: [x, y, z], speed }: it turns about an axle
 */
/** A block w by h by d with its middle at (x, y, z). */
const blk = (w, h, d, c, x, y, z, o) => add(BOX, c, w, h, d, x, y, z, o);
/** A rod of radius r and length len: upright, or along `ax` ('x' or 'z'). r2: its radius at the far end; seg: sides; open: no ends; sz: flattened. */
function rod(r, len, c, x, y, z, o = {}) {
  const r2 = o.r2 ?? r, big = Math.max(r, r2, 0.001), geo = cylGeo(o.seg || 8, r2 / big, r / big, !!o.open);
  const turn = o.ax === 'x' ? { rz: (o.rz || 0) - Math.PI / 2 } : o.ax === 'z' ? { rx: (o.rx || 0) + Math.PI / 2 } : null;
  add(geo, c, big, len, big * (o.sz || 1), x, y, z, turn ? { ...o, ...turn } : o);
}
/** A ball: 20 flat faces, or 80 with `fine`. sx, sy, sz stretch it. */
const ball = (r, c, x, y, z, o = {}) => add(o.fine ? ICO1 : ICO0, c, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1), x, y, z, { faceted: true, ...o });
const rock = (r, c, x, y, z, o = {}) => add(DODE, c, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1), x, y, z, o);
const gem = (r, h, c, x, y, z, o) => add(OCTA, c, r, h, r, x, y, z, o);
/** A flat disc facing +z. */
const disc = (r, c, x, y, z, o = {}) => add(discGeo(o.seg || 8), c, r, r, 1, x, y, z, o);
/** A roof: its ridge along x, its foot at y. */
const prism = (w, h, d, c, x, y, z, o) => add(PRISM, c, w, h, d, x, y, z, o);
/** A flag held along its edge at (x, y, z), flying toward +x. */
const flag = (len, hgt, c, x, y, z, o = {}) => add(FLAG, c, len, hgt, 1, x, y, z, { sway: { from: [x, y, z], dir: [0, 0, 1], amp: 1 }, ...o });

const _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** Join parts into plain lists of numbers, in the thing's own space. */
function gather(parts, moving) {
  let count = 0, tris = 0;
  for (const p of parts) { count += p.geo.attributes.position.count; tris += (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3; }
  const out = { count, tris, pos: new Float32Array(count * 3), nor: new Float32Array(count * 3), col: new Float32Array(count * 3), metal: new Float32Array(count), tint: new Float32Array(count), idx: new Uint32Array(tris * 3) };
  if (moving) { out.fx = new Float32Array(count * 4); out.pivot = new Float32Array(count * 3); out.axis = new Float32Array(count * 3); }
  let v = 0, i = 0;
  // TINT: this corner takes the colour of the copy; the part's own colour stays underneath for a copy that is given none
  const shade = (hex, k, own) => { if (hex === TINT) { out.tint[k] = 1; hex = own; } _c.set(hex); out.col[k * 3] = _c.r; out.col[k * 3 + 1] = _c.g; out.col[k * 3 + 2] = _c.b; };
  for (const { geo, color, m, o } of parts) {
    const P = geo.attributes.position, N = geo.attributes.normal, n = P.count, back = m.determinant() < 0;
    _nm.getNormalMatrix(m);
    for (let k = 0; k < n; k++) {
      const up = N.getY(k), at = v + k;
      _v.fromBufferAttribute(P, k).applyMatrix4(m); out.pos[at * 3] = _v.x; out.pos[at * 3 + 1] = _v.y; out.pos[at * 3 + 2] = _v.z;
      _n.fromBufferAttribute(N, k).applyMatrix3(_nm).normalize(); out.nor[at * 3] = _n.x; out.nor[at * 3 + 1] = _n.y; out.nor[at * 3 + 2] = _n.z;
      if (o.tint) out.tint[at] = o.tint === true ? 1 : o.tint;
      shade(color, at, 0x808080);
      if (o.top != null && up > 0.9) { out.tint[at] = 0; shade(o.top, at, color); if (o.top === TINT) out.tint[at] = o.lid ?? 1; }
      if (o.cap != null && Math.abs(up) > 0.9) { out.tint[at] = 0; shade(o.cap, at, color); }
      out.metal[at] = o.m || 0;
      if (!moving) continue;
      out.fx[at * 4] = o.glow || 0; out.fx[at * 4 + 1] = o.blink || 0;
      if (o.spin) {
        out.fx[at * 4 + 3] = o.spin.speed;
        out.pivot.set(o.spin.at, at * 3); out.axis.set(o.spin.axis, at * 3);
      } else if (o.sway) {
        const f = o.sway.from;
        out.fx[at * 4 + 2] = Math.max(0.001, Math.hypot(_v.x - f[0], _v.y - f[1], _v.z - f[2]) * (o.sway.amp ?? 1));
        out.pivot.set(f, at * 3); out.axis.set(o.sway.dir, at * 3);
      }
    }
    if (o.faceted && !geo.index) {   // one normal for each face
      for (let k = 0; k < n; k += 3) {
        const q = (v + k) * 3;
        _a.set(out.pos[q + 3] - out.pos[q], out.pos[q + 4] - out.pos[q + 1], out.pos[q + 5] - out.pos[q + 2]);
        _b.set(out.pos[q + 6] - out.pos[q], out.pos[q + 7] - out.pos[q + 1], out.pos[q + 8] - out.pos[q + 2]);
        _n.crossVectors(_a, _b).normalize(); if (back) _n.negate();
        for (let j = 0; j < 9; j += 3) { out.nor[q + j] = _n.x; out.nor[q + j + 1] = _n.y; out.nor[q + j + 2] = _n.z; }
      }
    }
    const I = geo.index?.array, len = I ? I.length : n;
    for (let k = 0; k < len; k += 3) {
      const a = I ? I[k] : k, b = I ? I[k + 1] : k + 1, c = I ? I[k + 2] : k + 2;
      out.idx[i++] = v + a; out.idx[i++] = v + (back ? c : b); out.idx[i++] = v + (back ? b : c);
    }
    v += n;
  }
  return out;
}

const shapes = new Map();
/** A thing as lists of numbers, drawn once: { still, live } (live is null for a thing with nothing that glows or moves). */
function shapeOf(kind) {
  if (!shapes.has(kind)) {
    S = { still: [], live: [] };
    MODELS[kind]();
    shapes.set(kind, { still: gather(S.still, false), live: S.live.length ? gather(S.live, true) : null });
    S = null;
  }
  return shapes.get(kind);
}

// ------------------------------------------------------------------------------------------ a yard's worth of them
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const dressed = [];

function joined(copies, moving) {
  let count = 0, tris = 0;
  for (const c of copies) { count += c.shape.count; tris += c.shape.tris; }
  if (!count) return null;
  const pos = new Float32Array(count * 3), nor = new Int8Array(count * 3), col = new Float32Array(count * 3), index = new (count > 65535 ? Uint32Array : Uint16Array)(tris * 3);
  const metal = moving ? null : new Uint8Array(count);
  const fx = moving ? new Float32Array(count * 4) : null, pivot = moving ? new Float32Array(count * 3) : null, axis = moving ? new Float32Array(count * 3) : null;
  let v = 0, i = 0;
  for (const { shape, m, tint } of copies) {
    const e = m.elements, back = m.determinant() < 0, n = shape.count;
    _nm.getNormalMatrix(m);
    if (tint != null) _c.set(tint);
    const point = (src, k, dst, at) => {
      const x = src[k * 3], y = src[k * 3 + 1], z = src[k * 3 + 2];
      dst[at * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; dst[at * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; dst[at * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    };
    for (let k = 0; k < n; k++) {
      const at = v + k, t = shape.tint[k];
      point(shape.pos, k, pos, at);
      _n.set(shape.nor[k * 3], shape.nor[k * 3 + 1], shape.nor[k * 3 + 2]).applyMatrix3(_nm).normalize();
      nor[at * 3] = Math.round(_n.x * 127); nor[at * 3 + 1] = Math.round(_n.y * 127); nor[at * 3 + 2] = Math.round(_n.z * 127);
      if (t > 0 && tint != null) { col[at * 3] = _c.r * t; col[at * 3 + 1] = _c.g * t; col[at * 3 + 2] = _c.b * t; }
      else { col[at * 3] = shape.col[k * 3]; col[at * 3 + 1] = shape.col[k * 3 + 1]; col[at * 3 + 2] = shape.col[k * 3 + 2]; }
      if (metal) metal[at] = Math.round(shape.metal[k] * 255);
      if (!moving) continue;
      fx.set(shape.fx.subarray(k * 4, k * 4 + 4), at * 4);
      point(shape.pivot, k, pivot, at);
      _n.set(shape.axis[k * 3], shape.axis[k * 3 + 1], shape.axis[k * 3 + 2]).transformDirection(m);
      axis[at * 3] = _n.x; axis[at * 3 + 1] = _n.y; axis[at * 3 + 2] = _n.z;
    }
    for (let k = 0; k < shape.idx.length; k += 3) {   // a mirrored copy turns its faces inside out: their order is turned back
      index[i++] = v + shape.idx[k]; index[i++] = v + shape.idx[k + (back ? 2 : 1)]; index[i++] = v + shape.idx[k + (back ? 1 : 2)];
    }
    v += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (metal) g.setAttribute('metal', new THREE.BufferAttribute(metal, 1, true));
  if (moving) { g.setAttribute('fx', new THREE.BufferAttribute(fx, 4)); g.setAttribute('pivot', new THREE.BufferAttribute(pivot, 3)); g.setAttribute('axis', new THREE.BufferAttribute(axis, 3)); }
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  if (moving) g.boundingSphere.radius += 1.2;   // room for what flaps and turns
  return g;
}

/**
 * The paint on the floor, as one more thing to join with the rest: quads [x, z, w, d, turn, colour] and rings
 * [x, z, r0, r1, colour], flat, already at their places in the yard.
 */
function painted(quads, rings) {
  const SEG = 14, count = quads.length * 4 + rings.length * (SEG + 1) * 2, tris = quads.length * 2 + rings.length * SEG * 2;
  if (!count) return null;
  const out = { count, tris, pos: new Float32Array(count * 3), nor: new Float32Array(count * 3), col: new Float32Array(count * 3), metal: new Float32Array(count), tint: new Float32Array(count), idx: new Uint32Array(tris * 3) };
  const LIFT = 0.0118;   // over the yard's ground, under the worn paths
  let v = 0, i = 0;
  const corner = (x, z) => { out.pos[v * 3] = x; out.pos[v * 3 + 1] = LIFT; out.pos[v * 3 + 2] = z; out.nor[v * 3 + 1] = 1; out.col[v * 3] = _c.r; out.col[v * 3 + 1] = _c.g; out.col[v * 3 + 2] = _c.b; return v++; };
  const face = (a, b, c) => { out.idx[i++] = a; out.idx[i++] = b; out.idx[i++] = c; };
  for (const [x, z, w, d, turn, color] of quads) {
    const cos = Math.cos(turn), sin = Math.sin(turn);
    _c.set(color);
    const at = (lx, lz) => corner(x + lx * cos + lz * sin, z - lx * sin + lz * cos);
    const a = at(-w / 2, -d / 2), b = at(-w / 2, d / 2), c = at(w / 2, d / 2), e = at(w / 2, -d / 2);
    face(a, b, c); face(a, c, e);
  }
  for (const [x, z, r0, r1, color] of rings) {
    _c.set(color);
    const first = v;
    for (let k = 0; k <= SEG; k++) { const a = k / SEG * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a); corner(x + cos * r0, z - sin * r0); corner(x + cos * r1, z - sin * r1); }
    for (let k = 0; k < SEG; k++) { const q = first + k * 2; face(q, q + 1, q + 3); face(q, q + 3, q + 2); }
  }
  return out;
}

const HERE = new THREE.Matrix4();
/**
 * The meshes of a yard's dressing, at their places in the world.
 * @param plan  what yardDressing() in js/sim/dressing.js returns
 * @returns the meshes to add to the yard: the still things with the paint, and what glows or moves (if there is any)
 */
export function buildDressing(plan) {
  const M = materials(), still = [], live = [];
  for (const p of plan.props) {
    const shape = shapeOf(p.kind), k = (p.scale || 1) * SIZE;
    const m = new THREE.Matrix4().compose(_p.set(p.x, 0, p.z), _q.setFromAxisAngle(UP, p.turn), _s.set(p.flip ? -k : k, k, k));
    still.push({ shape: shape.still, m, tint: p.tint });
    if (shape.live) live.push({ shape: shape.live, m, tint: p.tint });
  }
  const paint = painted(plan.quads, plan.rings);
  if (paint) still.push({ shape: paint, m: HERE, tint: null });
  const out = [];
  const mesh = (geo, material, cast, receive) => {
    if (!geo) return null;
    const o = new THREE.Mesh(geo, material);
    o.castShadow = cast; o.receiveShadow = receive; o.matrixAutoUpdate = false; o.name = 'dressing';
    out.push(o); return o;
  };
  const things = mesh(joined(still, false), M.still, !lean, true);
  mesh(joined(live, true), M.live, false, false);
  if (things) dressed.push(things);
  return out;
}

let lean = false;
/** The low graphics level: the things throw no shadows, and nothing flaps, turns or blinks. `calm`: less motion was asked for. */
export function setDressingDetail(low, calm = false) {
  life.value = low || calm ? 0 : 1;
  if (low === lean) return;
  lean = low;
  for (const o of dressed) o.castShadow = !low;
}

/** For the catalogue in js/sim/dressing.js: what every thing measures as it stands in a yard, { kind: [length, depth, height, triangles, how far its back reaches behind it] }. */
export function measureProps() {
  const out = {};
  for (const kind in MODELS) {
    const s = shapeOf(kind), box = { w: 0, d0: 0, d: 0, h: 0 };
    for (let k = 0; k < s.still.count; k++) {
      box.w = Math.max(box.w, Math.abs(s.still.pos[k * 3]) * 2); box.h = Math.max(box.h, s.still.pos[k * 3 + 1]);
      if (s.still.pos[k * 3 + 1] * SIZE < 2) box.d = Math.max(box.d, s.still.pos[k * 3 + 2]);   // a roof or a parasol may reach further out than the thing stands
      box.d0 = Math.min(box.d0, s.still.pos[k * 3 + 2]);
    }
    const top = s.live ? Math.max(...Array.from({ length: s.live.count }, (_, k) => s.live.pos[k * 3 + 1])) : 0;
    out[kind] = [+(box.w * SIZE).toFixed(2), +(box.d * SIZE).toFixed(2), +(Math.max(box.h, top) * SIZE).toFixed(2), s.still.tris + (s.live?.tris || 0), +(box.d0 * SIZE).toFixed(2)];
  }
  return out;
}

// ------------------------------------------------------------------------------------------ colours
const C = {
  bark: 0x6b4226, log: 0xa8672f, cut: 0xe2bd8a, plank: 0xd9b47c, plank2: 0xcfa76c, plank3: 0xc49a63, wood: 0xa8743f, dark: 0x8b5a2b, walnut: 0x6b4a2f,
  straw: 0xe3c765, straw2: 0xc9a84a, canvas: 0xe9e1cc, card: 0xc9a36a, stone: 0xb9bbb6, stone2: 0x9da2a3, stone3: 0x8d9294, brick: 0xb8553a, tile: 0x9c4a36, sand: 0xe9d8a6,
  iron: 0x3c4149, coal: 0x24272c, steel: 0xc9cfd5, grey: 0x8a9099, rubber: 0x1d1f23, concrete: 0xb3aea4, soil: 0x4a3a2c,
  hazard: 0xf2b630, orange: 0xff8a1f, red: 0xd94a36, wine: 0x8e2f3a, blue: 0x2f7fd6, navy: 0x1f3a6e, green: 0x4f9a3f, leaf: 0x5aa845, pine: 0x3a8f55,
  white: 0xeef0f2, cream: 0xf1e8d2, water: 0x3f94c9, glass: 0xbfe6ff, gold: 0xf2c24a, copper: 0xc7744a, bread: 0xd99a4e,
  teal: 0x2f8f83, cyan: 0x3ad6e6, pink: 0xff5fa8, magenta: 0xc74bd6, violet: 0x8e5bd6, lamp: 0xffe2a0, ember: 0xff7a1a, graphite: 0x2b3440, slate: 0x3d4652,
};
const Y = [0, 1, 0], Z = [0, 0, 1], X = [1, 0, 0];

// ------------------------------------------------------------------------------------------ parts used by many things
const crate = (x, z, s = 0.6, y = 0, ry = 0) => {
  blk(s, s, s, C.card, x, y + s / 2, z, { ry, tint: true });
  for (const k of [0.05, s - 0.05]) blk(s + 0.05, 0.08, s + 0.05, C.dark, x, y + k, z, { ry });
};
const barrel = (x, z, y = 0, o = {}) => {
  rod(0.27, 0.8, C.red, x, y + 0.4, z, { tint: true, top: TINT, lid: 0.82, seg: 10, ...o });
  if (o.ax) return;
  for (const k of [0.16, 0.5]) rod(0.285, 0.05, C.grey, x, y + k, z, { open: true, seg: 10 });
  rod(0.29, 0.06, C.steel, x, y + 0.775, z, { open: true, seg: 10, m: 0.6 });   // the rim, which is what the camera sees of it
  rod(0.05, 0.03, C.steel, x + 0.13, y + 0.805, z + 0.06, { seg: 5, m: 0.6 });   // and the bung
};
const palletBase = (x, z, w = 1.2, d = 1.0, y = 0) => {
  for (const k of [-1, 0, 1]) blk(0.1, 0.1, d, 0xb98d57, x + k * (w / 2 - 0.05), y + 0.05, z);
  blk(w, 0.045, d, C.plank2, x, y + 0.122, z);
};
/** A log lying along x (or z), bark around and cut wood at its ends. */
const log = (r, len, x, y, z, ax = 'x', o = {}) => rod(r, len, C.log, x, y, z, { ax, cap: C.cut, ...o });
/** A lantern: a small cage with a light in it. */
const lamp = (x, y, z, s = 0.2, color = 0xffc46b, glow = 1.9) => {
  blk(s, s * 1.2, s, color, x, y, z, { glow });
  blk(s * 1.25, s * 0.2, s * 1.25, C.iron, x, y + s * 0.7, z); blk(s * 1.1, s * 0.12, s * 1.1, C.iron, x, y - s * 0.66, z);
};
/** A long-handled tool leaning back against the fence: 'shovel', 'pick', 'sledge' or 'rake'. */
const tool = (kind, x, z = 0.3, len = 1.35) => {
  const tilt = -0.2, top = len * Math.cos(tilt), back = z + len * Math.sin(tilt) / 2;
  blk(0.045, len, 0.045, C.wood, x, top / 2, back + 0.02, { rx: tilt });
  if (kind === 'shovel') blk(0.2, 0.3, 0.03, C.steel, x, 0.16, z + 0.14, { rx: tilt, m: 0.8 });
  else if (kind === 'pick') blk(0.6, 0.06, 0.06, C.iron, x, top - 0.08, z - 0.24, { m: 0.5 });
  else if (kind === 'sledge') blk(0.26, 0.14, 0.14, C.iron, x, top - 0.1, z - 0.24, { m: 0.5 });
  else blk(0.46, 0.05, 0.1, C.iron, x, 0.06, z + 0.16);
};
/** A tree-like crown of flat faces, as in the forest. */
const bush = (r, x, y, z, c = C.leaf, o = {}) => ball(r, c, x, y, z, { sy: 0.85, ...o });
/** A neon sign: two posts, a dark board, and whatever `draw` puts on it (x across the board, y up from its middle). */
const neon = draw => {
  for (const x of [-1.15, 1.15]) blk(0.1, 2.7, 0.1, C.graphite, x, 1.35, 0.2);
  blk(2.5, 1.35, 0.08, 0x1c222b, 0, 2.0, 0.22);
  blk(2.56, 0.06, 0.14, C.steel, 0, 2.7, 0.22, { m: 0.8 }); blk(2.56, 0.06, 0.14, C.steel, 0, 1.3, 0.22, { m: 0.8 });
  draw((w, h, c, x, y, rz = 0) => blk(w, h, 0.035, c, x, 2.0 + y, 0.285, { rz, glow: 2.3 }));
};

// ------------------------------------------------------------------------------------------ the things
const MODELS = {
  // ---- anywhere
  crate: () => crate(0, 0.36, 0.62, 0, 0.18),
  crates: () => { crate(-0.38, 0.4, 0.64, 0, 0.08); crate(0.36, 0.38, 0.56, 0, -0.16); crate(-0.24, 0.42, 0.5, 0.64, 0.5); },
  barrel: () => barrel(0, 0.31),
  barrels: () => { barrel(-0.38, 0.33); barrel(0.22, 0.3); rod(0.27, 0.8, C.red, 0.2, 0.27, 0.76, { ax: 'x', tint: 0.85, ry: 0.25 }); },
  pallet: () => {
    palletBase(0, 0.55);
    blk(0.56, 0.42, 0.9, C.card, -0.29, 0.355, 0.55, { tint: true }); blk(0.56, 0.52, 0.9, C.card, 0.29, 0.405, 0.55, { tint: 0.88 });
    blk(0.7, 0.34, 0.7, C.card, -0.08, 0.84, 0.55, { ry: 0.14, tint: 1.1 });
    blk(0.06, 0.44, 0.92, C.white, -0.29, 0.36, 0.55);
  },
  sacks: () => {
    ball(0.36, C.canvas, -0.3, 0.17, 0.4, { fine: true, faceted: false, sy: 0.48, sz: 0.72 }); ball(0.36, C.canvas, 0.32, 0.17, 0.42, { fine: true, faceted: false, sy: 0.48, sz: 0.72, ry: 0.3 });
    ball(0.34, 0xdcd2b8, 0.0, 0.44, 0.4, { fine: true, faceted: false, sy: 0.46, sz: 0.72, ry: -0.25 });
  },
  rocks: () => {
    rock(0.36, C.stone3, -0.34, 0.24, 0.45, { sy: 0.75, ry: 0.4 }); rock(0.28, C.stone2, 0.22, 0.18, 0.36, { sy: 0.7, ry: 1.3 });
    rock(0.22, C.stone, 0.5, 0.14, 0.66, { sy: 0.7, ry: 2.1 }); rock(0.18, C.stone3, -0.02, 0.1, 0.74, { sy: 0.65, ry: 0.9 });
  },
  stump: () => rod(0.3, 0.46, C.bark, 0, 0.23, 0.36, { r2: 0.25, cap: C.cut }),
  bench: () => {
    for (const z of [0.22, 0.38, 0.54]) blk(1.7, 0.05, 0.13, C.wood, 0, 0.46, z);
    for (const y of [0.66, 0.84]) blk(1.7, 0.13, 0.05, C.wood, 0, y, 0.1, { rx: -0.12 });
    for (const x of [-0.7, 0.7]) { blk(0.07, 0.46, 0.5, C.iron, x, 0.23, 0.36); blk(0.07, 0.5, 0.07, C.iron, x, 0.68, 0.1); }
  },
  cones: () => {
    const cone = (x, z, lying) => {
      blk(0.34, 0.04, 0.34, C.rubber, x, 0.02, z);
      rod(0.14, 0.55, C.orange, x + (lying ? 0.26 : 0), lying ? 0.15 : 0.3, z, { r2: 0.02, seg: 6, open: true, ...(lying ? { ax: 'x' } : {}) });
      if (!lying) rod(0.098, 0.1, C.white, x, 0.26, z, { r2: 0.076, seg: 6, open: true });
    };
    cone(-0.55, 0.26); cone(0.0, 0.3); cone(0.5, 0.24, true);
  },
  bollards: () => { for (const x of [-0.9, 0, 0.9]) { rod(0.11, 0.8, C.hazard, x, 0.4, 0.2, { seg: 6 }); rod(0.115, 0.14, C.rubber, x, 0.52, 0.2, { seg: 6, open: true }); rod(0.115, 0.1, C.rubber, x, 0.22, 0.2, { seg: 6, open: true }); } },
  hazardsign: () => {
    rod(0.04, 1.3, C.steel, 0, 0.65, 0.16, { seg: 5, m: 0.7 });
    blk(0.5, 0.5, 0.04, C.hazard, 0, 1.38, 0.18, { rz: Math.PI / 4 });
    blk(0.07, 0.22, 0.05, C.rubber, 0, 1.43, 0.2); blk(0.07, 0.07, 0.05, C.rubber, 0, 1.24, 0.2);
  },
  lantern: () => {
    blk(0.12, 1.95, 0.12, C.dark, 0, 0.975, 0.14); blk(0.1, 0.09, 0.42, C.dark, 0, 1.86, 0.3); blk(0.07, 0.4, 0.07, C.dark, 0, 1.68, 0.24, { rx: -0.8 });
    lamp(0, 1.62, 0.44, 0.2);
  },
  lampglobe: () => {
    rod(0.13, 0.22, C.iron, 0, 0.11, 0.25, { seg: 6 }); rod(0.045, 2.3, C.iron, 0, 1.25, 0.25, { seg: 6, r2: 0.035 });
    blk(0.62, 0.05, 0.05, C.iron, 0, 2.36, 0.25);
    for (const x of [-0.28, 0.28]) { blk(0.04, 0.12, 0.04, C.iron, x, 2.42, 0.25); ball(0.15, C.lamp, x, 2.58, 0.25, { glow: 1.25 }); }
  },
  floodlight: () => {
    blk(0.5, 0.14, 0.5, C.concrete, 0, 0.07, 0.3); rod(0.07, 4.0, C.grey, 0, 2.1, 0.3, { seg: 5, r2: 0.05, m: 0.5 });
    blk(0.7, 0.06, 0.06, C.grey, 0, 4.05, 0.3, { m: 0.5 });
    for (const x of [-0.26, 0.26]) { blk(0.3, 0.2, 0.16, C.iron, x, 3.92, 0.42, { rx: 0.7 }); blk(0.24, 0.15, 0.03, C.lamp, x, 3.87, 0.49, { rx: 0.7, glow: 1.5 }); }
  },
  litterbin: () => { rod(0.24, 0.78, C.slate, 0, 0.39, 0.28, { r2: 0.26, top: 0x14161a }); rod(0.275, 0.08, C.steel, 0, 0.82, 0.28, { open: true, m: 0.8 }); },
  handtruck: () => {
    for (const x of [-0.22, 0.22]) blk(0.05, 1.25, 0.05, C.red, x, 0.66, 0.3, { rx: -0.22 });
    blk(0.5, 0.05, 0.05, C.red, 0, 1.22, 0.17, { rx: -0.22 }); blk(0.5, 0.05, 0.05, C.red, 0, 0.7, 0.29, { rx: -0.22 });
    blk(0.52, 0.03, 0.3, C.steel, 0, 0.07, 0.58, { m: 0.7 });
    for (const x of [-0.3, 0.3]) rod(0.14, 0.07, C.rubber, x, 0.14, 0.42, { ax: 'x', seg: 6 });
    blk(0.44, 0.4, 0.3, C.card, 0, 0.29, 0.58); blk(0.4, 0.3, 0.28, 0xb98a5a, 0, 0.64, 0.54);
  },
  toolrack: () => {
    for (const x of [-0.68, 0.68]) blk(0.08, 1.05, 0.08, C.dark, x, 0.525, 0.08);
    blk(1.5, 0.07, 0.07, C.dark, 0, 1.0, 0.1);
    tool('shovel', -0.45); tool('pick', -0.1); tool('sledge', 0.24, 0.3, 1.15); tool('rake', 0.52);
  },
  wheelbarrow: () => {
    blk(0.82, 0.3, 0.6, C.pine, -0.05, 0.5, 0.38, { rz: 0.08, top: C.soil });
    rod(0.2, 0.08, C.rubber, 0.52, 0.2, 0.38, { ax: 'z', seg: 8, cap: C.grey });
    for (const z of [0.12, 0.64]) { blk(1.35, 0.045, 0.045, C.wood, -0.18, 0.36, z, { rz: 0.1 }); blk(0.045, 0.3, 0.045, C.iron, -0.4, 0.15, z); }
    rock(0.17, C.stone2, -0.1, 0.68, 0.36, { sy: 0.7 }); rock(0.12, C.stone3, 0.16, 0.66, 0.44, { sy: 0.7, ry: 1 });
  },
  planter: () => {
    blk(2.0, 0.5, 0.66, C.white, 0, 0.3, 0.35, { top: C.soil }); blk(1.9, 0.06, 0.56, C.slate, 0, 0.03, 0.35);
    bush(0.34, -0.62, 0.72, 0.35, C.leaf, { tint: true }); bush(0.38, 0.0, 0.76, 0.36, C.leaf, { tint: 0.9, ry: 1 }); bush(0.33, 0.62, 0.71, 0.34, C.leaf, { tint: 1.1, ry: 2 });
  },
  planttree: () => {
    blk(0.8, 0.5, 0.8, C.white, 0, 0.28, 0.45, { top: C.soil }); blk(0.7, 0.06, 0.7, C.slate, 0, 0.03, 0.45);
    rod(0.05, 1.05, C.bark, 0, 1.05, 0.45, { seg: 5 });
    ball(0.56, C.leaf, 0, 1.9, 0.45, { fine: true, sy: 1.02 }); ball(0.3, 0x6dbb4e, 0.26, 2.2, 0.5, {});
  },
  flowerbox: () => {
    blk(1.6, 0.34, 0.44, C.wood, 0, 0.27, 0.25, { top: C.soil }); for (const x of [-0.6, 0.6]) blk(0.12, 0.1, 0.4, C.dark, x, 0.05, 0.25);
    blk(1.4, 0.14, 0.3, C.green, 0, 0.5, 0.25);
    [0xffffff, 0xffe066, 0xff9ec4, 0xc9a6ff, 0xffb347, 0xff6f61].forEach((c, i) => gem(0.085, 0.07, c, -0.58 + i * 0.23, 0.63 + (i % 2) * 0.05, 0.2 + (i % 3) * 0.05));
  },
  tuft: () => { [[-0.1, 0.34, 0.5], [0.02, 0.4, -0.3], [0.12, 0.3, 1.2], [-0.02, 0.26, 2.2]].forEach(([x, h, ry], i) => add(TRI_UP, i % 2 ? 0x5aa845 : 0x4f9a3f, 0.11, h, 1, x, 0, 0.05 * i, { ry, sway: { from: [x, 0, 0], dir: X, amp: 1.1 } })); },
  flower: () => {
    add(TRI_UP, C.green, 0.09, 0.26, 1, -0.06, 0, 0, { ry: 0.4, sway: { from: [0, 0, 0], dir: X, amp: 1.1 } }); add(TRI_UP, C.leaf, 0.09, 0.22, 1, 0.07, 0, 0.03, { ry: -0.8, sway: { from: [0, 0, 0], dir: X, amp: 1.1 } });
    gem(0.075, 0.06, 0xffffff, 0, 0.29, 0.01, { tint: true, sway: { from: [0, 0, 0], dir: X, amp: 1.1 } }); gem(0.06, 0.05, 0xffffff, 0.12, 0.2, 0.06, { tint: 0.9, sway: { from: [0, 0, 0], dir: X, amp: 1.1 } });
  },
  pebble: () => { gem(0.15, 0.08, C.stone2, -0.08, 0.05, 0.12, { ry: 0.5 }); gem(0.11, 0.06, C.stone, 0.1, 0.04, 0.16, { ry: 1.4 }); gem(0.08, 0.05, C.stone3, 0.0, 0.03, 0.27, { ry: 2.2 }); },

  // ---- Lumber Town: the sawmill and the carpentry
  logdeck: () => {
    for (const x of [-0.9, 0.9]) blk(0.16, 0.14, 1.2, C.dark, x, 0.07, 0.62);
    [[0.3, 0.31, 2.7, 0.05], [0.62, 0.3, 2.85, -0.04], [0.94, 0.31, 2.6, 0.08], [0.46, 0.59, 2.75, -0.06], [0.78, 0.59, 2.6, 0.1], [0.62, 0.86, 2.5, 0]].forEach(([z, y, len, x]) => log(0.165, len, x, y, z));
    for (const x of [-0.6, 0.6]) blk(0.08, 0.72, 0.08, C.dark, x, 0.36, 1.16);
  },
  sawhorse: () => {
    blk(1.5, 0.1, 0.12, C.plank3, 0, 0.74, 0.4);
    for (const x of [-0.6, 0.6]) for (const s of [-1, 1]) blk(0.07, 0.86, 0.07, C.wood, x, 0.37, 0.4 + s * 0.2, { rx: s * 0.42 });
    log(0.13, 1.25, 0.05, 0.92, 0.4);
    blk(0.5, 0.16, 0.02, C.steel, 0.55, 0.42, 0.72, { m: 0.8, rz: 1.25 }); blk(0.05, 0.2, 0.05, C.red, 0.47, 0.74, 0.72, { rz: 1.25 });
  },
  plankstack: () => {
    for (const x of [-0.8, 0.8]) blk(0.12, 0.1, 0.95, C.dark, x, 0.05, 0.5);
    [[2.25, 0.02], [2.15, -0.05], [2.2, 0.04], [2.05, -0.02]].forEach(([len, x], i) => blk(len, 0.13, 0.9, [C.plank, C.plank2, C.plank3, C.plank][i], x, 0.165 + i * 0.14, 0.5));
    for (const [z, x] of [[0.2, 0.0], [0.5, -0.1], [0.8, 0.06]]) blk(2.1, 0.06, 0.26, C.cut, x, 0.75, z);
    blk(1.9, 0.05, 0.24, C.plank2, 0.1, 0.5, 0.96, { rx: 0.5, rz: 0.03 });
  },
  firewood: () => {
    for (const x of [-0.78, 0.78]) for (const z of [0.1, 0.5]) blk(0.07, 1.2, 0.07, C.dark, x, 0.6, z);
    blk(1.6, 0.06, 0.5, C.dark, 0, 0.1, 0.3);
    blk(1.44, 0.72, 0.42, C.bark, 0, 0.5, 0.3);
    for (let i = 0; i < 5; i++) log(0.14, 0.5, -0.56 + i * 0.28, 0.93, 0.3, 'z', { seg: 6 });
    for (let i = 0; i < 8; i++) disc(0.12, C.cut, -0.54 + (i % 4) * 0.36 + (i > 3 ? 0.1 : 0), 0.33 + Math.floor(i / 4) * 0.3, 0.515, { seg: 6 });
  },
  stumpaxe: () => {
    rod(0.3, 0.5, C.bark, 0, 0.25, 0.42, { r2: 0.26, cap: C.cut });
    blk(0.05, 0.62, 0.05, C.wood, 0.14, 0.76, 0.42, { rz: -0.5 }); blk(0.18, 0.13, 0.04, C.steel, -0.03, 0.56, 0.42, { rz: -0.5, m: 0.8 });
    log(0.1, 0.38, -0.2, 0.1, 0.72, 'x', { seg: 6, ry: 0.5 }); log(0.09, 0.36, 0.22, 0.09, 0.2, 'x', { seg: 6, ry: -0.9 });
  },
  timbershed: () => {
    for (const x of [-1.5, 1.5]) { blk(0.14, 1.85, 0.14, C.dark, x, 0.925, 0.1); blk(0.14, 2.3, 0.14, C.dark, x, 1.15, 1.14); }
    blk(3.4, 0.09, 1.46, 0x7d4a2c, 0, 2.16, 0.62, { rx: -0.37 }); blk(3.3, 0.1, 0.1, C.dark, 0, 2.3, 1.14);
    blk(3.0, 1.5, 0.06, C.plank3, 0, 0.9, 0.07);
    for (const x of [-0.75, 0.75]) blk(0.1, 0.08, 0.9, C.dark, x, 0.04, 0.6);
    [[1.9, C.plank], [1.8, C.plank2], [1.85, C.plank]].forEach(([len, c], i) => blk(len, 0.14, 0.8, c, -0.4 + i * 0.04, 0.15 + i * 0.15, 0.6));
    for (const [x, c] of [[0.95, C.plank2], [1.15, C.cut]]) blk(0.2, 1.55, 0.05, c, x, 0.76, 0.34, { rx: -0.22 });
    lamp(-1.22, 2.08, 1.14, 0.2);
  },
  pennant: () => {
    blk(0.34, 0.14, 0.34, C.stone2, 0, 0.07, 0.25); rod(0.045, 3.3, C.cut, 0, 1.65, 0.25, { seg: 5, r2: 0.03 }); gem(0.07, 0.09, C.gold, 0, 3.36, 0.25, { m: 0.8 });
    flag(0.95, 0.24, C.red, 0.03, 3.1, 0.25); flag(0.95, 0.24, C.cream, 0.03, 2.86, 0.25);
  },
  workbench: () => {
    blk(1.9, 0.1, 0.72, C.plank, 0, 0.84, 0.5);
    for (const x of [-0.85, 0.85]) for (const z of [0.2, 0.8]) blk(0.1, 0.8, 0.1, C.wood, x, 0.4, z);
    blk(1.7, 0.05, 0.56, C.plank3, 0, 0.3, 0.5); blk(0.5, 0.26, 0.4, C.card, -0.45, 0.46, 0.5);
    for (const x of [-0.9, 0.9]) blk(0.08, 1.72, 0.08, C.wood, x, 0.86, 0.08);
    blk(1.86, 0.74, 0.05, C.walnut, 0, 1.32, 0.08);
    blk(0.5, 0.16, 0.02, C.steel, -0.5, 1.4, 0.115, { m: 0.8 }); blk(0.12, 0.2, 0.03, C.red, -0.8, 1.4, 0.115);
    blk(0.06, 0.42, 0.03, C.cut, 0.05, 1.3, 0.115); blk(0.22, 0.1, 0.04, C.iron, 0.05, 1.52, 0.115);
    blk(0.36, 0.05, 0.02, C.steel, 0.55, 1.2, 0.115, { m: 0.8 }); blk(0.05, 0.36, 0.02, C.steel, 0.4, 1.36, 0.115, { m: 0.8 });
    blk(0.22, 0.2, 0.26, C.iron, -0.72, 0.99, 0.78, { m: 0.4 }); blk(0.34, 0.1, 0.12, C.cut, 0.3, 0.94, 0.56, { ry: 0.3 });
  },
  timberrack: () => {
    for (const x of [-0.85, 0.85]) for (const s of [-1, 1]) blk(0.08, 1.95, 0.08, C.dark, x, 0.93, 0.5 + s * 0.24, { rx: s * 0.25 });
    blk(1.8, 0.08, 0.08, C.dark, 0, 1.85, 0.5); for (const z of [0.14, 0.86]) blk(1.8, 0.07, 0.07, C.dark, 0, 0.14, z);
    [[-0.55, C.plank], [-0.22, C.cut], [0.12, C.plank2], [0.5, C.plank3]].forEach(([x, c], i) => blk(0.3, 1.7 - i * 0.07, 0.045, c, x, 0.9 - i * 0.035, 0.78, { rx: -0.25 }));
    for (const [x, c] of [[-0.3, C.plank3], [0.3, C.plank]]) blk(0.3, 1.6, 0.045, c, x, 0.85, 0.22, { rx: 0.25 });
  },
  chairframes: () => {
    const chair = (x, z, ry, back) => {
      const at = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
      const part = (w, h, d, lx, y, lz, c = C.plank) => { const [px, pz] = at(lx, lz); blk(w, h, d, c, px, y, pz, { ry }); };
      part(0.5, 0.06, 0.5, 0, 0.5, 0, C.cut);
      for (const lx of [-0.21, 0.21]) for (const lz of [-0.21, 0.21]) part(0.06, 0.5, 0.06, lx, 0.25, lz);
      if (back) { for (const lx of [-0.21, 0.21]) part(0.06, 0.56, 0.06, lx, 0.8, -0.21); part(0.48, 0.14, 0.05, 0, 0.98, -0.21, C.cut); }
    };
    chair(-0.42, 0.42, 0.2, true); chair(0.42, 0.4, -0.5, false);
    blk(0.5, 0.04, 0.12, C.plank2, 0.4, 0.55, 0.42, { ry: 0.6 });
  },
  toolshed: () => {
    blk(2.2, 1.9, 1.06, 0xb5803f, 0, 0.95, 0.6); prism(2.2, 0.62, 1.06, 0xb5803f, 0, 1.9, 0.6);
    for (const s of [-1, 1]) blk(2.5, 0.07, 0.84, 0x7d3f2c, 0, 2.27, 0.6 + s * 0.32, { rx: s * 0.86 });
    blk(0.62, 1.35, 0.05, C.walnut, -0.55, 0.68, 1.135); blk(0.06, 0.06, 0.04, C.gold, -0.34, 0.7, 1.17, { m: 0.8 });
    blk(0.62, 0.5, 0.04, C.cream, 0.55, 1.18, 1.135); blk(0.5, 0.38, 0.03, C.lamp, 0.55, 1.18, 1.16, { glow: 1.1 });
    blk(0.74, 0.07, 0.1, C.walnut, 0.55, 0.9, 1.17);
  },

  // ---- the quarry
  stoneblocks: () => {
    [[-0.5, 0.25, 0.5, 0.95, 0.5, 0.8, C.stone, 0.03], [0.52, 0.22, 0.55, 0.9, 0.44, 0.75, C.stone2, -0.04], [-0.4, 0.74, 0.5, 0.8, 0.46, 0.7, C.stone2, 0.1], [0.5, 0.66, 0.5, 0.8, 0.42, 0.66, C.stone, -0.12], [0.1, 1.06, 0.5, 0.62, 0.34, 0.56, C.stone, 0.3]]
      .forEach(([x, y, z, w, h, d, c, ry]) => blk(w, h, d, c, x, y, z, { ry }));
    blk(0.5, 0.3, 0.36, C.stone3, 0.72, 0.15, 0.9, { ry: 0.6 }); blk(0.05, 0.9, 0.05, C.iron, -0.9, 0.42, 0.95, { rz: 0.5, m: 0.5 });
  },
  hoist: () => {
    const top = [0, 3.05, 0.65];
    for (const [x, z] of [[-0.95, 0.15], [0.95, 0.15], [0, 1.16]]) {
      const dx = top[0] - x, dz = top[2] - z, len = Math.hypot(dx, top[1], dz);
      blk(0.11, len, 0.11, C.dark, x + dx / 2, top[1] / 2, z + dz / 2, { rz: -Math.asin(dx / len), rx: Math.atan2(dz, top[1]) });
    }
    rod(0.15, 0.09, C.iron, 0, 2.72, 0.65, { ax: 'x', m: 0.5 }); blk(0.035, 1.5, 0.035, C.canvas, 0, 1.95, 0.65);
    blk(0.7, 0.5, 0.56, C.stone, 0, 0.95, 0.65, { ry: 0.25 }); blk(0.74, 0.06, 0.08, C.canvas, 0, 1.0, 0.65, { ry: 0.25 }); blk(0.08, 0.54, 0.6, C.canvas, 0, 0.95, 0.65, { ry: 0.25 });
    blk(0.8, 0.4, 0.6, C.stone2, -0.5, 0.2, 0.7, { ry: -0.1 }); blk(0.6, 0.34, 0.5, C.stone, 0.55, 0.17, 0.6, { ry: 0.2 });
    rod(0.07, 1.3, C.wood, 0, 0.9, 0.2, { ax: 'x', seg: 6 }); blk(0.05, 0.4, 0.05, C.iron, 0.7, 0.9, 0.2, { rx: 0.5 });
  },
  brickpallet: () => {
    palletBase(0, 0.55);
    blk(1.1, 0.56, 0.9, C.brick, 0, 0.425, 0.55); for (const x of [-0.3, 0.3]) blk(0.06, 0.58, 0.92, C.cream, x, 0.425, 0.55);
    for (const [x, z, ry] of [[-0.3, 0.4, 0.2], [0.05, 0.6, -0.4], [0.34, 0.42, 0.9]]) blk(0.3, 0.11, 0.15, 0xc7623f, x, 0.76, z, { ry });
  },

  // ---- the farm and the bakery
  haybales: () => {
    const bale = (x, y, z, ry) => { blk(0.95, 0.5, 0.55, C.straw, x, y, z, { ry }); for (const k of [-0.25, 0.25]) blk(0.035, 0.52, 0.57, C.straw2, x + k * Math.cos(ry), y, z - k * Math.sin(ry), { ry }); };
    bale(-0.55, 0.25, 0.35, 0.05); bale(0.45, 0.25, 0.36, -0.06); bale(-0.1, 0.75, 0.36, 0.3);
    rod(0.44, 0.6, C.straw2, 0.5, 0.44, 0.76, { ax: 'x', seg: 10, cap: C.straw, ry: 1.2 });
  },
  scarecrow: () => {
    blk(0.08, 2.0, 0.08, C.dark, 0, 1.0, 0.25); blk(1.5, 0.07, 0.07, C.dark, 0, 1.5, 0.25);
    blk(0.52, 0.62, 0.24, 0xc8452f, 0, 1.3, 0.25); for (const s of [-1, 1]) { blk(0.5, 0.17, 0.17, 0xc8452f, s * 0.48, 1.5, 0.25, { rz: s * 0.08 }); rod(0.09, 0.2, C.straw, s * 0.82, 1.5, 0.25, { ax: 'x', r2: 0.02, seg: 5, open: true, rz: s > 0 ? 0 : Math.PI }); }
    ball(0.2, C.canvas, 0, 1.82, 0.25); rod(0.36, 0.03, C.straw, 0, 1.97, 0.25, { seg: 7 }); rod(0.18, 0.2, C.straw2, 0, 2.08, 0.25, { seg: 6, r2: 0.14 });
    blk(0.56, 0.3, 0.26, 0x3f5a8f, 0, 0.86, 0.25);
  },
  windpump: () => {
    const H = 4.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) blk(0.07, H + 0.05, 0.07, C.grey, sx * 0.37, H / 2, 0.6 + sz * 0.37, { rz: sx * 0.108, rx: -sz * 0.108, m: 0.4 });
    for (const [y, r] of [[1.0, 0.72], [2.1, 0.52], [3.2, 0.33]]) rod(r, 0.06, C.grey, 0, y, 0.6, { seg: 4, open: true, ry: Math.PI / 4, m: 0.4 });
    blk(0.5, 0.05, 0.5, C.dark, 0, H, 0.6); blk(0.2, 0.22, 0.5, C.iron, 0, H + 0.2, 0.7);
    const hub = [0, H + 0.2, 1.01], spin = { at: hub, axis: Z, speed: 1.7 };
    rod(0.09, 0.1, C.red, hub[0], hub[1], hub[2], { ax: 'z', seg: 6, spin });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; blk(0.2, 0.62, 0.02, i % 2 ? C.white : C.steel, hub[0] - Math.sin(a) * 0.42, hub[1] + Math.cos(a) * 0.42, hub[2], { rz: a, ry: 0, spin }); }
    blk(0.03, 0.03, 0.9, C.iron, 0, H + 0.2, 0.2); blk(0.02, 0.4, 0.5, C.red, 0, H + 0.2, -0.3);
    rod(0.32, 0.4, C.wood, 0.45, 0.2, 0.86, { top: C.water, seg: 8 }); rod(0.035, 1.0, C.iron, 0.12, 0.5, 0.8, { seg: 4, m: 0.4 });
  },
  trough: () => {
    blk(1.6, 0.4, 0.6, C.wood, 0, 0.32, 0.36, { top: C.water }); for (const x of [-0.6, 0.6]) blk(0.14, 0.12, 0.66, C.dark, x, 0.06, 0.36);
    rod(0.15, 0.26, C.steel, 0.55, 0.13, 0.82, { r2: 0.18, top: C.water, m: 0.7, seg: 6 });
  },
  vegcrates: () => {
    for (const [x, ry] of [[-0.42, 0.05], [0.42, -0.1]]) blk(0.72, 0.3, 0.56, C.plank3, x, 0.15, 0.38, { ry, top: C.soil });
    for (const [x, z] of [[-0.6, 0.3], [-0.38, 0.46], [-0.22, 0.28]]) ball(0.15, 0xe8862a, x, 0.34, z, { sy: 0.8 });
    for (const [x, z] of [[0.24, 0.32], [0.46, 0.46], [0.62, 0.3]]) ball(0.14, 0x7cc257, x, 0.34, z, { sy: 0.85 });
    ball(0.19, 0xe8862a, 0.02, 0.15, 0.72, { sy: 0.8, ry: 1 });
  },
  churns: () => {
    const churn = (x, z) => { rod(0.17, 0.5, C.steel, x, 0.25, z, { seg: 6, m: 0.9 }); rod(0.17, 0.16, C.steel, x, 0.58, z, { r2: 0.1, seg: 6, open: true, m: 0.9 }); rod(0.12, 0.07, C.grey, x, 0.69, z, { seg: 6, m: 0.9 }); };
    churn(-0.3, 0.3); churn(0.12, 0.26); rod(0.13, 0.24, C.steel, 0.46, 0.12, 0.42, { r2: 0.16, seg: 6, m: 0.8, top: C.white });
  },
  breadcart: () => {
    blk(1.8, 0.12, 0.9, C.wood, -0.15, 0.78, 0.6); for (const z of [0.16, 1.04]) blk(1.8, 0.14, 0.05, C.dark, -0.15, 0.9, z);
    for (const z of [0.1, 1.1]) rod(0.42, 0.06, C.walnut, 0.1, 0.42, z, { ax: 'z', seg: 10, cap: C.wood });
    for (const z of [0.3, 0.9]) blk(0.95, 0.05, 0.05, C.dark, -1.1, 0.74, z, { rz: 0.1 }); blk(0.05, 0.66, 0.05, C.dark, -0.95, 0.36, 0.6);
    for (const [x, z, ry] of [[-0.75, 0.42, 0.2], [-0.4, 0.74, -0.3], [-0.3, 0.4, 0.1], [0.05, 0.7, 0.5]]) blk(0.36, 0.15, 0.17, C.bread, x, 0.92, z, { ry });
    rod(0.24, 0.22, C.straw2, 0.5, 0.95, 0.56, { r2: 0.28, top: C.bread });
    for (const x of [-0.98, 0.68]) for (const z of [0.2, 1.0]) blk(0.05, 1.1, 0.05, C.cream, x, 1.38, z);
    for (let i = 0; i < 5; i++) blk(0.38, 0.05, 1.12, i % 2 ? C.cream : C.red, -0.91 + i * 0.38, 1.96 - Math.abs(i - 2) * 0.035, 0.6, { rz: (2 - i) * 0.07 });
  },
  breadcrates: () => {
    for (const x of [-0.5, 0.5]) for (const z of [0.12, 0.72]) blk(0.05, 0.95, 0.05, C.dark, x, 0.475, z);
    for (const y of [0.1, 0.42, 0.74]) blk(1.06, 0.14, 0.68, C.plank, 0, y, 0.42, { top: C.walnut });
    for (const [x, z, ry] of [[-0.28, 0.3, 0.1], [0.22, 0.28, -0.2], [-0.2, 0.56, 0.3], [0.26, 0.56, 0]]) blk(0.36, 0.14, 0.17, C.bread, x, 0.84, z, { ry });
  },
  cafetable: () => {
    rod(0.4, 0.04, C.cream, 0, 0.74, 0.6, { seg: 8 }); rod(0.04, 0.72, C.iron, 0, 0.36, 0.6, { seg: 5 }); rod(0.2, 0.03, C.iron, 0, 0.015, 0.6, { seg: 6 });
    for (const x of [-0.62, 0.62]) { rod(0.17, 0.05, C.wood, x, 0.46, 0.66, { seg: 6 }); rod(0.035, 0.45, C.iron, x, 0.225, 0.66, { seg: 4 }); }
    rod(0.025, 1.5, C.cut, 0, 1.5, 0.6, { seg: 4 });
    rod(0.74, 0.32, C.red, 0, 2.06, 0.62, { r2: 0.03, seg: 8, open: true }); rod(0.75, 0.07, C.cream, 0, 1.87, 0.62, { seg: 8, open: true });
    rod(0.07, 0.1, C.white, 0.14, 0.81, 0.56, { seg: 5 }); blk(0.2, 0.03, 0.14, C.bread, -0.12, 0.775, 0.66, { ry: 0.5 });
  },

  // ---- the glassworks
  sandheap: () => {
    blk(2.0, 0.34, 0.06, C.dark, 0, 0.17, 0.05); blk(0.06, 0.34, 1.2, C.dark, -0.97, 0.17, 0.66);
    rod(0.78, 0.72, C.sand, -0.18, 0.36, 0.62, { r2: 0.02, seg: 8, open: true, sz: 0.8 }); rod(0.5, 0.44, 0xdcc98f, 0.52, 0.22, 0.6, { r2: 0.02, seg: 7, open: true });
    blk(0.045, 0.95, 0.045, C.wood, 0.3, 0.72, 0.5, { rz: -0.3 }); blk(0.2, 0.26, 0.03, C.steel, 0.17, 0.3, 0.5, { rz: -0.3, m: 0.8 });
  },
  glassrack: () => {
    blk(1.8, 0.1, 0.92, C.iron, 0, 0.15, 0.5); for (const x of [-0.7, 0.7]) for (const z of [0.14, 0.86]) rod(0.08, 0.06, C.rubber, x, 0.08, z, { ax: 'z', seg: 5 });
    for (const x of [-0.86, 0.86]) for (const s of [-1, 1]) blk(0.06, 1.55, 0.06, C.iron, x, 0.95, 0.5 + s * 0.17, { rx: s * 0.2 });
    blk(1.78, 0.06, 0.06, C.iron, 0, 1.7, 0.5);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) blk(1.5 - i * 0.12, 1.3 - i * 0.1, 0.03, i === 1 ? 0x9fe3ff : C.glass, (i - 1) * 0.06, 0.86 - i * 0.04, 0.5 + s * (0.23 + i * 0.07), { rx: s * 0.2, m: 1 });
  },
  carboys: () => {
    const jar = (x, z, c, k = 1) => { rod(0.2 * k, 0.42 * k, c, x, 0.21 * k, z, { seg: 6, m: 0.7 }); rod(0.2 * k, 0.16 * k, c, x, 0.5 * k, z, { r2: 0.07 * k, seg: 6, open: true, m: 0.7 }); rod(0.06 * k, 0.16 * k, C.cut, x, 0.64 * k, z, { seg: 5 }); };
    jar(-0.38, 0.32, 0x6fbf8f); jar(0.08, 0.36, 0x7fc4e8, 1.25); jar(0.46, 0.26, 0x9fe3ff, 0.85);
  },
  sandsilo: () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) blk(0.1, 1.6, 0.1, C.iron, sx * 0.5, 0.8, 0.65 + sz * 0.5);
    for (const y of [0.5, 1.5]) rod(0.72, 0.07, C.iron, 0, y, 0.65, { seg: 4, open: true, ry: Math.PI / 4 });
    rod(0.16, 0.75, 0x4a90b8, 0, 1.3, 0.65, { r2: 0.58, seg: 8, open: true }); rod(0.58, 1.1, 0x4a90b8, 0, 2.22, 0.65, { seg: 8 });
    for (const y of [1.8, 2.6]) rod(0.595, 0.07, 0x2f6687, 0, y, 0.65, { seg: 8, open: true });
    rod(0.6, 0.3, 0x2f6687, 0, 2.92, 0.65, { r2: 0.08, seg: 8, open: true }); rod(0.09, 0.4, C.steel, 0, 0.75, 0.65, { seg: 5, m: 0.8 });
    rod(0.4, 0.3, C.sand, 0.1, 0.15, 0.7, { r2: 0.02, seg: 6, open: true });
  },

  // ---- the mines
  minecart: () => {
    for (const z of [0.36, 0.86]) blk(3.3, 0.06, 0.06, C.grey, 0, 0.1, z, { m: 0.7 });
    for (let i = 0; i < 6; i++) blk(0.16, 0.06, 0.96, C.walnut, -1.5 + i * 0.6, 0.03, 0.61);
    blk(0.12, 0.5, 0.9, C.dark, -1.58, 0.3, 0.61); blk(0.4, 0.08, 0.08, C.dark, -1.42, 0.2, 0.36, { rz: 0.7 }); blk(0.4, 0.08, 0.08, C.dark, -1.42, 0.2, 0.86, { rz: 0.7 });
    blk(1.05, 0.08, 0.56, C.iron, 0.3, 0.32, 0.61); blk(1.05, 0.52, 0.78, 0x5a5f68, 0.3, 0.62, 0.61, { top: TINT });
    for (const x of [-0.05, 0.65]) for (const z of [0.3, 0.92]) rod(0.17, 0.06, C.iron, x, 0.3, z, { ax: 'z', seg: 6, m: 0.5 });
    ball(0.24, C.stone3, 0.1, 0.9, 0.56, { tint: 1, sy: 0.7 }); ball(0.2, C.stone3, 0.5, 0.9, 0.7, { tint: 0.85, sy: 0.7, ry: 1 }); ball(0.16, C.stone3, 0.34, 0.98, 0.5, { tint: 1.15, sy: 0.7, ry: 2 });
    ball(0.16, C.stone3, 1.2, 0.1, 0.9, { tint: 0.9, sy: 0.6 });
  },
  pitprops: () => {
    for (const x of [-0.8, 0.8]) blk(0.12, 0.1, 1.0, C.walnut, x, 0.05, 0.5);
    [[0.15, 0.2, 0.02], [0.39, 0.2, -0.05], [0.63, 0.2, 0.04], [0.87, 0.2, -0.02], [0.27, 0.42, 0.06], [0.51, 0.42, -0.04], [0.75, 0.42, 0.03], [0.39, 0.64, -0.03], [0.63, 0.64, 0.05]]
      .forEach(([z, y, x], i) => blk(2.3, 0.2, 0.2, [C.wood, C.dark, 0x9c6b3c][i % 3], x, y, z));
  },
  oreheap: () => {
    blk(1.8, 0.3, 0.06, C.walnut, 0, 0.15, 0.05); blk(0.06, 0.3, 1.0, C.walnut, 0.87, 0.15, 0.55);
    rod(0.64, 0.62, C.stone3, 0.05, 0.31, 0.56, { r2: 0.02, seg: 7, open: true, tint: 0.8 });
    ball(0.2, C.stone3, -0.6, 0.12, 0.7, { tint: 1, sy: 0.7 }); ball(0.16, C.stone3, 0.5, 0.1, 0.94, { tint: 1.15, sy: 0.7 }); ball(0.17, C.stone3, -0.2, 0.42, 0.74, { tint: 1.1, sy: 0.7, ry: 1 }); ball(0.14, C.stone3, 0.24, 0.46, 0.46, { tint: 0.95, sy: 0.7, ry: 2 });
  },
  sluice: () => {
    const tilt = { rz: -0.11 };
    blk(3.0, 0.05, 0.46, C.wood, 0, 0.78, 0.5, tilt); for (const z of [0.28, 0.72]) blk(3.0, 0.22, 0.04, C.dark, 0, 0.87, z, tilt);
    blk(2.9, 0.02, 0.38, C.water, 0, 0.82, 0.5, { ...tilt, m: 0.6 });
    for (const x of [-0.8, 0, 0.8]) blk(0.05, 0.07, 0.38, C.plank3, x, 0.84 - x * 0.11, 0.5, tilt);
    for (const [x, h] of [[-1.1, 0.92], [1.1, 0.68]]) { for (const s of [-1, 1]) blk(0.07, h, 0.07, C.dark, x, h / 2, 0.5 + s * 0.3, { rx: s * 0.2 }); blk(0.08, 0.07, 0.7, C.dark, x, h * 0.45, 0.5); }
    blk(0.5, 0.36, 0.6, C.wood, -1.38, 1.1, 0.5, { top: C.water });
    rod(0.15, 0.3, C.steel, 1.5, 0.15, 0.6, { r2: 0.19, seg: 6, m: 0.7, top: 0xd9b23c });
    rod(0.17, 0.07, C.copper, 0.85, 0.2, 0.92, { r2: 0.28, seg: 8, m: 0.8, rx: -1.0 });
  },
  strongboxes: () => {
    const chest = (x, y, z, w, ry) => {
      blk(w, 0.5, 0.52, 0x3d4f3f, x, y + 0.25, z, { ry });
      for (const k of [-0.28, 0.28]) blk(0.07, 0.52, 0.54, C.iron, x + k * w * Math.cos(ry), y + 0.25, z - k * w * Math.sin(ry), { ry, m: 0.5 });
      blk(0.1, 0.12, 0.04, C.gold, x + 0.27 * Math.sin(ry), y + 0.3, z + 0.27 * Math.cos(ry), { ry, m: 0.9 });
    };
    chest(-0.2, 0, 0.4, 0.85, 0.06); chest(-0.25, 0.5, 0.38, 0.62, -0.25);
    for (const [x, y, z, ry] of [[0.46, 0.05, 0.62, 0.2], [0.5, 0.05, 0.44, -0.1], [0.48, 0.14, 0.53, 0.5]]) blk(0.26, 0.09, 0.12, C.gold, x, y, z, { ry, m: 1 });
  },
  goldpans: () => {
    rod(0.17, 0.08, 0x8a8f96, -0.3, 0.04, 0.4, { r2: 0.28, seg: 8, m: 0.8, top: 0xd9b23c });
    rod(0.17, 0.08, 0x8a8f96, 0.3, 0.3, 0.16, { r2: 0.28, seg: 8, m: 0.8, rx: 1.15 });
    tool('shovel', 0.5, 0.26, 1.1); blk(0.3, 0.2, 0.22, C.canvas, -0.1, 0.1, 0.16);
  },
  crystals: () => {
    rock(0.44, C.stone3, -0.3, 0.2, 0.55, { sy: 0.6, ry: 0.4 }); rock(0.36, C.stone2, 0.4, 0.16, 0.6, { sy: 0.55, ry: 1.4 });
    [[-0.3, 0.55, 1.2, 0.17, 0.1, -0.1, 0x8e5bd6], [0.1, 0.6, 0.9, 0.14, -0.25, 0.1, 0x6a4fe0], [0.45, 0.6, 0.66, 0.12, -0.5, -0.15, 0x1fc7e0], [-0.62, 0.62, 0.6, 0.11, 0.55, 0.2, 0xb565e0], [0.0, 0.92, 0.5, 0.1, 0.1, 0.6, 0x3aa0ff]]
      .forEach(([x, z, h, r, rz, rx, c]) => {
        const cx = x - Math.sin(rz) * h / 2, cz = z + Math.sin(rx) * h / 2, tipx = x - Math.sin(rz) * (h + r), tipz = z + Math.sin(rx) * (h + r);
        rod(r, h, c, cx, 0.2 + h / 2 * Math.cos(rz), cz, { seg: 6, open: true, rz, rx, glow: 1.2 });
        rod(r, r * 2, c, tipx, 0.2 + (h + r) * Math.cos(rz), tipz, { r2: 0.01, seg: 6, open: true, rz, rx, glow: 1.5 });
      });
  },

  // ---- the forge
  anvil: () => {
    rod(0.32, 0.5, C.bark, 0, 0.25, 0.42, { r2: 0.28, cap: C.cut });
    blk(0.34, 0.08, 0.24, C.iron, 0, 0.54, 0.42, { m: 0.5 }); blk(0.18, 0.14, 0.15, C.iron, 0, 0.65, 0.42, { m: 0.5 }); blk(0.5, 0.13, 0.22, 0x4a4f57, 0.03, 0.78, 0.42, { m: 0.6 });
    rod(0.065, 0.24, 0x4a4f57, -0.34, 0.79, 0.42, { ax: 'x', r2: 0.01, seg: 6, rz: Math.PI, m: 0.6 });
    blk(0.045, 0.6, 0.045, C.wood, 0.42, 0.3, 0.3, { rz: 0.3 }); blk(0.2, 0.12, 0.12, C.iron, 0.5, 0.58, 0.3, { rz: 0.3, m: 0.5 });
  },
  coalbin: () => {
    blk(1.5, 0.85, 0.06, C.walnut, 0, 0.425, 0.05); for (const x of [-0.72, 0.72]) blk(0.06, 0.7, 0.9, C.walnut, x, 0.35, 0.5); blk(1.5, 0.36, 0.06, C.walnut, 0, 0.18, 0.95);
    blk(1.38, 0.34, 0.84, C.coal, 0, 0.2, 0.5, { rx: -0.12 });
    [[-0.4, 0.5, 0.4], [0.1, 0.56, 0.3], [0.44, 0.46, 0.5], [-0.1, 0.4, 0.66], [0.3, 0.36, 0.76], [-0.5, 0.36, 0.74]].forEach(([x, y, z], i) => gem(0.16, 0.12, i % 2 ? 0x30343a : C.coal, x, y, z, { ry: i }));
    tool('shovel', 0.5, 0.42, 1.0);
  },
  barrack: () => {
    for (const x of [-0.7, 0.7]) { blk(0.08, 1.2, 0.08, C.iron, x, 0.6, 0.12); blk(0.08, 0.08, 0.56, C.iron, x, 0.04, 0.32); for (const y of [0.42, 0.86]) blk(0.07, 0.06, 0.46, C.iron, x, y, 0.34, { rx: 0.12 }); }
    for (const [y, n] of [[0.47, 4], [0.91, 3]]) for (let i = 0; i < n; i++) blk(1.62 - i * 0.05, 0.055, 0.075, i % 2 ? 0xb8c0c8 : 0x9aa3ad, (i % 2 ? 0.03 : -0.03), y - i * 0.012, 0.17 + i * 0.1, { m: 1 });
  },
  quenchtub: () => {
    rod(0.36, 0.6, C.wood, 0, 0.3, 0.44, { r2: 0.41, top: C.water }); for (const y of [0.14, 0.46]) rod(0.4, 0.05, C.iron, 0, y, 0.44, { open: true });
    blk(0.04, 0.8, 0.04, C.iron, 0.14, 0.62, 0.36, { rz: 0.35, m: 0.5 }); blk(0.04, 0.8, 0.04, C.iron, 0.2, 0.62, 0.4, { rz: 0.25, m: 0.5 });
  },
  hearth: () => {
    blk(1.5, 0.8, 1.0, C.brick, 0, 0.4, 0.62); blk(1.6, 0.08, 1.1, C.stone2, 0, 0.84, 0.62);
    blk(1.0, 0.08, 0.6, C.coal, 0, 0.9, 0.7); blk(0.66, 0.05, 0.36, C.ember, 0, 0.95, 0.7, { glow: 1.6 });
    for (const x of [-0.62, 0.62]) blk(0.22, 1.0, 0.22, C.brick, x, 1.38, 0.24);
    rod(0.92, 0.7, C.iron, 0, 2.18, 0.56, { r2: 0.26, seg: 4, open: true, ry: Math.PI / 4 });
    blk(0.38, 0.52, 0.38, C.brick, 0, 2.76, 0.56); blk(0.46, 0.08, 0.46, C.stone2, 0, 3.04, 0.56);
    gem(0.12, 0.12, C.coal, 0.5, 0.94, 0.5);
  },

  // ---- the oil field
  pipestack: () => {
    for (const x of [-0.9, 0.9]) blk(0.14, 0.1, 1.1, C.walnut, x, 0.05, 0.55);
    [[0.24, 0.27, 2.8, 0.03], [0.56, 0.27, 2.9, -0.04], [0.88, 0.27, 2.75, 0.05], [0.4, 0.55, 2.8, -0.05], [0.72, 0.55, 2.9, 0.04], [0.56, 0.83, 2.7, 0]].forEach(([z, y, len, x], i) => rod(0.165, len, i % 3 === 1 ? 0x566170 : 0x4a5560, x, y, z, { ax: 'x', cap: 0x15171a, m: 0.5 }));
    for (const x of [-0.9, 0.9]) blk(0.12, 0.2, 0.12, C.walnut, x, 0.2, 1.05, { rx: 0.5 });
  },
  valvetree: () => {
    rod(0.3, 0.1, C.iron, 0, 0.05, 0.45, { seg: 6 }); rod(0.12, 1.6, C.red, 0, 0.9, 0.45, { seg: 6, open: true }); rod(0.17, 0.08, C.steel, 0, 1.72, 0.45, { seg: 6, m: 0.8 });
    rod(0.1, 1.0, C.red, 0, 1.0, 0.45, { ax: 'x', seg: 6, open: true }); for (const x of [-0.5, 0.5]) rod(0.16, 0.06, C.steel, x, 1.0, 0.45, { ax: 'x', seg: 6, m: 0.8 });
    for (const [x, y] of [[0, 1.4], [-0.3, 1.0], [0.3, 1.0]]) { rod(0.03, 0.2, C.iron, x, y, 0.6, { ax: 'z', seg: 4, open: true }); rod(0.17, 0.035, x ? C.hazard : C.blue, x, y, 0.71, { ax: 'z', seg: 6 }); }
  },
  drumrack: () => {
    for (const x of [-0.98, 0.98]) for (const z of [0.1, 0.8]) blk(0.07, 1.5, 0.07, C.iron, x, 0.75, z);
    for (const y of [0.12, 0.82]) for (const z of [0.24, 0.66]) blk(2.0, 0.06, 0.06, C.iron, 0, y, z);
    [[-0.5, 0.42], [0.5, 0.42], [-0.5, 1.12], [0.42, 1.12]].forEach(([x, y], i) => rod(0.27, 0.82, C.red, x, y, 0.45, { ax: 'z', tint: i === 2 ? 0.8 : 1, cap: 0x23262b }));
  },
  bullettank: () => {
    for (const x of [-0.8, 0.8]) blk(0.3, 0.55, 1.0, C.concrete, x, 0.275, 0.62);
    rod(0.6, 2.3, 0xe3e7ea, 0, 1.05, 0.62, { ax: 'x', seg: 10, open: true, m: 0.25 });
    for (const s of [-1, 1]) rod(0.6, 0.24, 0xe3e7ea, s * 1.27, 1.05, 0.62, { ax: 'x', seg: 10, r2: 0.34, m: 0.25, rz: s > 0 ? 0 : Math.PI });
    rod(0.612, 0.26, C.red, 0.35, 1.05, 0.62, { ax: 'x', seg: 10, open: true });
    rod(0.2, 0.16, C.grey, -0.4, 1.7, 0.62, { seg: 6, m: 0.6 }); rod(0.05, 0.9, C.grey, 0.75, 0.75, 1.1, { seg: 5, m: 0.6 });
    rod(0.13, 0.03, C.hazard, 0.75, 0.9, 1.19, { ax: 'z', seg: 6 });
  },
  windsock: () => {
    blk(0.4, 0.1, 0.4, C.concrete, 0, 0.05, 0.3); rod(0.05, 3.5, C.white, 0, 1.8, 0.3, { seg: 5, r2: 0.035 });
    for (const y of [0.9, 2.1]) rod(0.052, 0.5, C.red, 0, y, 0.3, { seg: 5, open: true });
    const sway = { from: [0, 3.4, 0.3], dir: Z, amp: 0.9 };
    [[0.17, 0.14, C.orange], [0.14, 0.11, C.white], [0.11, 0.085, C.orange], [0.085, 0.06, C.white]].forEach(([a, b, c], i) => rod(a, 0.3, c, 0.19 + i * 0.3, 3.4 - i * 0.03, 0.3, { ax: 'x', r2: b, seg: 6, open: true, sway, rz: -0.1 }));
  },

  // ---- the jewelry
  displaycase: () => {
    blk(1.1, 0.75, 0.6, C.walnut, 0, 0.375, 0.42); blk(1.22, 0.06, 0.72, C.cream, 0, 0.78, 0.42); blk(1.14, 0.04, 0.64, C.gold, 0, 0.72, 0.42, { m: 0.9 });
    blk(0.7, 0.08, 0.4, C.violet, 0, 0.85, 0.42);
    rod(0.15, 0.06, C.gold, -0.14, 1.04, 0.42, { ax: 'z', seg: 8, open: true, m: 1 }); gem(0.07, 0.08, C.cyan, -0.14, 1.23, 0.42, { glow: 0.8 });
    gem(0.1, 0.12, C.pink, 0.2, 1.0, 0.42, { glow: 0.7 });
    for (const x of [-0.52, 0.52]) for (const z of [0.14, 0.7]) blk(0.03, 0.62, 0.03, C.gold, x, 1.12, z, { m: 0.9 });
    blk(1.1, 0.05, 0.62, C.walnut, 0, 1.45, 0.42);
  },
  velvetrope: () => {
    for (const x of [-1.15, 0, 1.15]) { rod(0.14, 0.04, C.gold, x, 0.02, 0.2, { seg: 6, m: 0.9 }); rod(0.03, 0.9, C.gold, x, 0.47, 0.2, { seg: 4, m: 0.9 }); gem(0.06, 0.07, C.gold, x, 0.97, 0.2, { m: 0.9 }); }
    for (const x of [-0.575, 0.575]) for (const s of [-1, 1]) blk(0.6, 0.055, 0.055, C.wine, x + s * 0.28, 0.76, 0.2, { rz: s * 0.28 });
  },
  safe: () => {
    blk(1.0, 0.08, 0.86, C.iron, 0, 0.04, 0.45); blk(0.92, 1.3, 0.76, 0x2f3a45, 0, 0.73, 0.45);
    blk(0.72, 1.06, 0.04, 0x3d4b58, 0, 0.73, 0.845); for (const y of [0.4, 1.06]) blk(0.06, 0.16, 0.06, C.steel, 0.4, y, 0.86, { m: 0.8 });
    rod(0.16, 0.04, C.gold, -0.06, 0.8, 0.885, { ax: 'z', seg: 8, m: 0.9 }); blk(0.4, 0.04, 0.03, C.gold, -0.06, 0.8, 0.91, { m: 0.9 }); blk(0.04, 0.4, 0.03, C.gold, -0.06, 0.8, 0.91, { m: 0.9 });
    rod(0.05, 0.03, C.steel, -0.06, 1.1, 0.88, { ax: 'z', seg: 6, m: 0.8 });
  },
  topiary: () => {
    rod(0.24, 0.46, C.copper, 0, 0.23, 0.45, { r2: 0.33, top: C.soil }); rod(0.04, 0.5, C.bark, 0, 0.7, 0.45, { seg: 4 });
    ball(0.37, C.pine, 0, 1.2, 0.45, { fine: true }); ball(0.24, C.green, 0, 1.7, 0.45, {});
  },
  gempost: () => {
    blk(0.8, 0.2, 0.8, C.white, 0, 0.1, 0.45); rod(0.2, 1.0, C.white, 0, 0.7, 0.45, { seg: 8, r2: 0.17 }); blk(0.56, 0.12, 0.56, C.white, 0, 1.26, 0.45); blk(0.48, 0.05, 0.48, C.gold, 0, 1.17, 0.45, { m: 0.9 });
    const spin = { at: [0, 1.8, 0.45], axis: Y, speed: 0.7 };
    add(new THREE.TorusGeometry(1, 0.22, 5, 12), C.gold, 0.3, 0.3, 0.3, 0, 1.75, 0.45, { glow: 0.35, spin });
    gem(0.13, 0.16, C.cyan, 0, 2.14, 0.45, { glow: 1.0, spin });
  },

  // ---- Industrial City: the power plant
  transformer: () => {
    blk(2.0, 0.12, 1.1, C.iron, 0, 0.06, 0.65); blk(1.3, 1.3, 0.8, 0x7f8f88, 0, 0.77, 0.65); blk(1.4, 0.08, 0.9, 0x6b7a74, 0, 1.46, 0.65);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) blk(0.06, 1.0, 0.7, 0x93a39c, s * (0.73 + i * 0.11), 0.76, 0.65);
    rod(0.2, 1.0, 0x7f8f88, 0, 1.92, 0.34, { ax: 'x', seg: 8 }); for (const x of [-0.3, 0.3]) blk(0.06, 0.3, 0.06, C.iron, x, 1.62, 0.34);
    for (const x of [-0.42, 0, 0.42]) { rod(0.05, 0.6, 0x8b4a24, x, 1.8, 0.82, { seg: 5, top: C.steel }); for (const y of [1.7, 1.9]) rod(0.13, 0.1, 0x8b4a24, x, y, 0.82, { r2: 0.05, seg: 5, open: true }); }
    blk(0.34, 0.34, 0.02, C.hazard, 0.3, 0.9, 1.065); blk(0.06, 0.2, 0.025, C.rubber, 0.3, 0.92, 1.07, { rz: 0.4 });
    blk(0.3, 0.4, 0.14, C.grey, -0.36, 0.7, 1.1);
  },
  cabledrums: () => {
    for (const z of [0.24, 0.84]) rod(0.65, 0.07, C.card, -0.5, 0.65, z, { ax: 'z', seg: 12, cap: C.plank });
    rod(0.42, 0.53, C.orange, -0.5, 0.65, 0.54, { ax: 'z', seg: 10, open: true }); disc(0.12, C.rubber, -0.5, 0.65, 0.88, { seg: 6 });
    for (const x of [-0.95, -0.05]) blk(0.2, 0.12, 0.7, C.walnut, x, 0.06, 0.54);
    for (const y of [0.03, 0.47]) rod(0.5, 0.06, C.card, 0.68, y, 0.62, { seg: 10, cap: C.plank }); rod(0.32, 0.38, C.rubber, 0.68, 0.25, 0.62, { seg: 8, open: true });
  },
  switchgear: () => {
    blk(1.7, 0.12, 0.6, C.concrete, 0, 0.06, 0.32);
    for (const x of [-0.54, 0, 0.54]) {
      blk(0.52, 1.6, 0.5, 0x8fa0ad, x, 0.92, 0.32); blk(0.34, 0.26, 0.02, C.slate, x, 0.5, 0.575);
      blk(0.07, 0.07, 0.03, 0x58e06a, x - 0.1, 1.42, 0.58, { glow: 1.6 }); blk(0.07, 0.07, 0.03, x ? 0xffb020 : 0xff4a3a, x + 0.06, 1.42, 0.58, { glow: 1.6, blink: x ? 0 : 0.3 });
      blk(0.05, 0.18, 0.04, C.steel, x + 0.18, 1.0, 0.58, { m: 0.8 });
    }
    blk(1.74, 0.06, 0.62, 0x6f7f8c, 0, 1.75, 0.32);
  },
  pylon: () => {
    blk(0.7, 0.16, 0.7, C.concrete, 0, 0.08, 0.4);
    [[0.3, 0.24, C.red], [0.24, 0.18, C.white], [0.18, 0.12, C.red]].forEach(([a, b, c], i) => rod(a, 1.5, c, 0, 0.9 + i * 1.5, 0.4, { r2: b, seg: 4, open: true, ry: Math.PI / 4 }));
    for (const [y, w] of [[3.5, 1.3], [4.3, 1.0]]) { blk(w, 0.07, 0.1, C.grey, 0, y, 0.4, { m: 0.5 }); for (const s of [-1, 1]) rod(0.05, 0.3, 0x8b4a24, s * (w / 2 - 0.06), y - 0.2, 0.4, { seg: 4 }); }
    rod(0.03, 0.4, C.grey, 0, 4.85, 0.4, { seg: 4 }); ball(0.1, 0xff3b30, 0, 5.02, 0.4, { glow: 2.2, blink: 0.1 });
  },
  cellrack: () => {
    for (const x of [-0.76, 0.76]) for (const z of [0.08, 0.52]) blk(0.06, 1.4, 0.06, C.iron, x, 0.7, z);
    for (const y of [0.2, 0.75, 1.3]) blk(1.56, 0.05, 0.5, C.grey, 0, y, 0.3);
    for (const y of [0.225, 0.775]) for (const x of [-0.48, 0, 0.48]) rod(0.14, 0.42, 0x58e06a, x, y + 0.21, 0.3, { seg: 6, cap: C.steel, glow: 0.45 });
  },

  // ---- the steel factory
  coils: () => {
    const coil = (x, y, z) => { rod(0.5, 0.6, 0xb8c0c8, x, y, z, { ax: 'z', seg: 12, m: 1, cap: 0x8a9299 }); disc(0.2, 0x1f2226, x, y, z + 0.305, { seg: 8 }); };
    coil(-0.55, 0.56, 0.6); coil(0.55, 0.56, 0.6); coil(0, 1.02 + 0.02, 0.62);
    rod(0.512, 0.07, C.blue, 0, 1.04, 0.62, { ax: 'z', seg: 12, open: true });
    for (const x of [-1.05, -0.05, 0.05, 1.05]) blk(0.2, 0.18, 0.7, C.walnut, x, 0.09, 0.6);
  },
  beams: () => {
    const beam = (x, y, z, len, c) => { blk(len, 0.22, 0.035, c, x, y, z, { m: 0.3 }); for (const k of [-0.11, 0.11]) blk(len, 0.035, 0.17, c, x, y + k, z, { m: 0.3 }); };
    for (const x of [-1.0, 1.0]) blk(0.14, 0.1, 0.95, C.walnut, x, 0.05, 0.5);
    beam(0, 0.24, 0.2, 3.1, 0x9c4a36); beam(0.05, 0.24, 0.5, 3.0, 0xa8523c); beam(-0.04, 0.24, 0.8, 3.15, 0x9c4a36);
    beam(0.1, 0.53, 0.35, 2.9, 0xa8523c); beam(-0.06, 0.53, 0.66, 3.0, 0x9c4a36);
  },
  slagbin: () => {
    for (const x of [-0.5, 0.5]) blk(0.14, 0.14, 1.1, C.iron, x, 0.07, 0.6);
    rod(0.6, 0.8, 0x4a4f57, 0, 0.55, 0.6, { r2: 0.82, seg: 4, open: true, ry: Math.PI / 4 }); blk(0.8, 0.04, 0.8, 0x4a4f57, 0, 0.16, 0.6);
    blk(1.08, 0.05, 1.08, 0x26292e, 0, 0.84, 0.6); rod(0.07, 1.6, C.iron, 0, 0.7, 0.6, { ax: 'x', seg: 5 });
    ball(0.22, 0x30343a, -0.2, 0.92, 0.5, { sy: 0.6 }); ball(0.18, 0x3a3f46, 0.24, 0.9, 0.74, { sy: 0.6, ry: 1 }); ball(0.16, 0x30343a, 0.22, 0.9, 0.38, { sy: 0.6, ry: 2 });
    for (const [x, z] of [[-0.1, 0.8], [0.02, 0.56], [-0.34, 0.74]]) gem(0.1, 0.07, C.ember, x, 0.93, z, { glow: 1.5 });
  },
  gascyl: () => {
    for (const x of [-0.7, 0.7]) blk(0.07, 1.5, 0.07, C.iron, x, 0.75, 0.08); for (const y of [0.5, 1.2]) blk(1.5, 0.06, 0.06, C.iron, 0, y, 0.08);
    blk(1.44, 0.04, 0.04, C.steel, 0, 0.9, 0.5, { m: 0.8 }); blk(1.5, 0.06, 0.5, C.iron, 0, 0.03, 0.3);
    [C.red, C.blue, C.grey, C.hazard].forEach((c, i) => { const x = -0.51 + i * 0.34; rod(0.13, 1.25, c, x, 0.69, 0.3, { seg: 6 }); rod(0.13, 0.16, c, x, 1.39, 0.3, { r2: 0.05, seg: 6, open: true }); blk(0.09, 0.12, 0.09, C.steel, x, 1.52, 0.3, { m: 0.8 }); });
  },
  gantry: () => {
    for (const x of [-1.65, 1.65]) { for (const s of [-1, 1]) blk(0.14, 3.02, 0.14, C.hazard, x, 1.5, 0.65 + s * 0.26, { rx: s * 0.17 }); blk(0.16, 0.1, 1.2, C.hazard, x, 0.05, 0.65); }
    blk(3.5, 0.3, 0.06, C.hazard, 0, 2.95, 0.65); for (const k of [-0.15, 0.15]) blk(3.5, 0.05, 0.24, C.hazard, 0, 2.95 + k, 0.65);
    blk(0.34, 0.2, 0.34, C.iron, 0.3, 2.72, 0.65); blk(0.035, 1.0, 0.035, C.grey, 0.3, 2.14, 0.65, { m: 0.6 }); blk(0.18, 0.2, 0.12, C.hazard, 0.3, 1.58, 0.65);
    blk(2.0, 0.22, 0.035, 0x9c4a36, 0.3, 1.3, 0.65, { ry: 0.12, m: 0.3 }); for (const k of [-0.11, 0.11]) blk(2.0, 0.035, 0.17, 0x9c4a36, 0.3, 1.3 + k, 0.65, { ry: 0.12, m: 0.3 });
  },
  ventshed: () => {
    blk(2.4, 2.0, 1.1, 0x8fa0ad, 0, 1.0, 0.63); blk(2.6, 0.1, 1.3, 0x5c6670, 0, 2.06, 0.63, { rx: -0.07 });
    blk(1.1, 1.5, 0.04, C.steel, -0.5, 0.75, 1.19, { m: 0.5 }); for (const y of [0.4, 0.8, 1.2]) blk(1.1, 0.025, 0.05, 0x7d858e, -0.5, y, 1.19);
    blk(0.6, 0.5, 0.04, C.slate, 0.7, 1.3, 1.19); blk(0.5, 0.4, 0.03, C.lamp, 0.7, 1.3, 1.21, { glow: 1.1 });
    rod(0.17, 0.16, C.steel, 0.6, 2.18, 0.6, { seg: 8, m: 0.8 });
    const spin = { at: [0.6, 2.4, 0.6], axis: Y, speed: 3.2 };
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; blk(0.05, 0.26, 0.2, i % 2 ? C.steel : C.grey, 0.6 + Math.cos(a) * 0.2, 2.4, 0.6 + Math.sin(a) * 0.2, { ry: -a + 0.5, spin }); }
    rod(0.25, 0.04, C.steel, 0.6, 2.55, 0.6, { seg: 6, spin });
  },

  // ---- the chemical plant
  totes: () => {
    const tote = (x, k) => {
      blk(1.06, 0.12, 1.06, C.iron, x, 0.06, 0.6); blk(1.0, 0.5, 1.0, C.blue, x, 0.37, 0.6, { tint: k }); blk(1.0, 0.5, 1.0, 0xf2f2ec, x, 0.87, 0.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) blk(0.04, 1.04, 0.04, C.steel, x + sx * 0.52, 0.64, 0.6 + sz * 0.52, { m: 0.8 });
      for (const y of [0.45, 0.85, 1.16]) rod(0.75, 0.04, C.steel, x, y, 0.6, { seg: 4, open: true, ry: Math.PI / 4, m: 0.8 });
      rod(0.13, 0.06, C.rubber, x, 1.15, 0.6, { seg: 6 });
    };
    tote(-0.6, 1); tote(0.6, 0.8);
  },
  piperack: () => {
    for (const x of [-1.95, 0, 1.95]) { for (const z of [0.1, 0.9]) blk(0.1, 2.3, 0.1, C.grey, x, 1.15, z, { m: 0.3 }); for (const y of [1.4, 2.2]) blk(0.1, 0.1, 0.9, C.grey, x, y, 0.5, { m: 0.3 }); }
    [[0.22, C.hazard], [0.46, C.blue], [0.72, 0x58b86a]].forEach(([z, c]) => rod(0.09, 4.2, c, 0, 1.54, z, { ax: 'x', seg: 6, open: true }));
    rod(0.14, 4.2, C.steel, 0, 2.39, 0.3, { ax: 'x', seg: 6, open: true, m: 1 }); rod(0.12, 4.2, C.white, 0, 2.37, 0.7, { ax: 'x', seg: 6, open: true });
    rod(0.09, 1.5, C.blue, 0.9, 0.78, 0.46, { seg: 6, open: true }); rod(0.14, 0.06, C.steel, 0.9, 0.5, 0.46, { seg: 6, m: 0.8 });
    rod(0.03, 0.2, C.iron, 0.9, 1.0, 0.6, { ax: 'z', seg: 4 }); rod(0.16, 0.035, C.red, 0.9, 1.0, 0.71, { ax: 'z', seg: 8 });
    for (const x of [-1.0, 1.0]) rod(0.13, 0.06, C.steel, x, 1.54, 0.22, { ax: 'x', seg: 6, m: 0.8 });
  },
  tankfarm: () => {
    blk(2.6, 0.1, 2.3, C.concrete, 0, 0.05, 1.2); for (const z of [0.1, 2.3]) blk(2.6, 0.32, 0.1, 0xa39e94, 0, 0.2, z); for (const x of [-1.25, 1.25]) blk(0.1, 0.32, 2.3, 0xa39e94, x, 0.2, 1.2);
    rod(0.75, 2.4, 0xe8eef2, -0.45, 1.3, 0.95, { seg: 12, open: true, m: 0.2 }); rod(0.76, 0.3, 0xcfd6dc, -0.45, 2.65, 0.95, { r2: 0.12, seg: 12 }); rod(0.762, 0.22, C.pink, -0.45, 1.9, 0.95, { seg: 12, open: true });
    rod(0.5, 1.7, 0xe8eef2, 0.72, 0.95, 1.6, { seg: 10, open: true, m: 0.2 }); rod(0.51, 0.22, 0xcfd6dc, 0.72, 1.91, 1.6, { r2: 0.08, seg: 10 }); rod(0.512, 0.18, 0x58b86a, 0.72, 1.3, 1.6, { seg: 10, open: true });
    for (const x of [-0.6, -0.3]) blk(0.035, 2.4, 0.035, C.hazard, x, 1.3, 1.72); for (const y of [0.6, 1.2, 1.8, 2.4]) blk(0.3, 0.03, 0.03, C.hazard, -0.45, y, 1.72);
    rod(0.07, 0.9, C.grey, 0.2, 0.5, 1.5, { ax: 'x', seg: 5, m: 0.6 }); rod(0.14, 0.035, C.red, 0.2, 0.5, 1.66, { ax: 'z', seg: 6 });
  },
  drumpallet: () => {
    palletBase(0, 0.65, 1.2, 1.2);
    [[-0.29, 0.36], [0.29, 0.36], [-0.29, 0.94], [0.29, 0.94]].forEach(([x, z], i) => rod(0.27, 0.86, C.blue, x, 0.575, z, { seg: 6, tint: i === 3 ? 0.8 : 1, top: TINT, lid: 0.7 }));
    blk(0.24, 0.24, 0.02, C.hazard, -0.29, 0.6, 1.215, { rz: Math.PI / 4 }); blk(1.2, 0.06, 1.2, C.white, 0, 0.8, 0.65);
  },
  shower: () => {
    blk(0.72, 0.04, 0.72, C.hazard, 0, 0.02, 0.4); rod(0.05, 2.3, C.pine, -0.26, 1.15, 0.14, { seg: 5, open: true }); rod(0.04, 0.5, C.pine, -0.26, 2.3, 0.36, { ax: 'z', seg: 5, open: true });
    rod(0.17, 0.08, C.hazard, -0.26, 2.24, 0.56, { r2: 0.1, seg: 6 }); blk(0.03, 0.5, 0.03, C.hazard, -0.08, 1.95, 0.4);
    rod(0.04, 0.34, C.pine, -0.26, 1.0, 0.3, { ax: 'z', seg: 5 }); rod(0.16, 0.07, C.hazard, -0.26, 1.03, 0.5, { r2: 0.19, seg: 6 });
    blk(0.34, 0.34, 0.03, C.pine, 0.2, 1.6, 0.12); blk(0.22, 0.07, 0.035, C.white, 0.2, 1.6, 0.125); blk(0.07, 0.22, 0.035, C.white, 0.2, 1.6, 0.125);
    rod(0.03, 1.5, C.pine, 0.2, 0.75, 0.12, { seg: 4, open: true });
  },

  // ---- the electronics factory
  servers: () => {
    blk(1.9, 0.1, 0.7, C.concrete, 0, 0.05, 0.36);
    for (const x of [-0.62, 0, 0.62]) {
      blk(0.58, 1.75, 0.6, C.graphite, x, 0.975, 0.36); blk(0.42, 0.02, 0.4, 0x565b63, x, 1.86, 0.36);
      [[1.5, C.cyan, 0], [1.2, 0x58e06a, 0.2 + x], [0.9, C.cyan, 0]].forEach(([y, c, blink], i) => blk(0.4, 0.035, 0.02, c, x, y, 0.665, { glow: 1.5, blink: i === 1 ? Math.abs(blink) + 0.1 : 0 }));
    }
    blk(1.8, 0.06, 0.2, C.steel, 0, 1.9, 0.2, { m: 0.8 });
  },
  acunit: () => {
    for (const x of [-0.5, 0.5]) blk(0.1, 0.12, 0.7, C.iron, x, 0.06, 0.4); blk(1.24, 0.95, 0.7, 0xd9dde2, 0, 0.6, 0.4);
    rod(0.37, 0.05, C.grey, -0.18, 0.6, 0.76, { ax: 'z', seg: 10, open: true }); disc(0.36, 0x23272e, -0.18, 0.6, 0.756, { seg: 10 });
    const spin = { at: [-0.18, 0.6, 0.77], axis: Z, speed: 9 };
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; blk(0.1, 0.3, 0.015, 0x8a9099, -0.18 - Math.sin(a) * 0.17, 0.6 + Math.cos(a) * 0.17, 0.77, { rz: a, spin }); }
    for (const y of [0.4, 0.6, 0.8]) blk(0.3, 0.05, 0.02, 0x8a9099, 0.4, y, 0.755); rod(0.04, 0.7, C.copper, 0.66, 0.5, 0.2, { seg: 4, m: 0.8 });
  },
  partsbins: () => {
    for (const x of [-0.72, 0.72]) for (const z of [0.08, 0.52]) blk(0.06, 1.6, 0.06, C.grey, x, 0.8, z, { m: 0.5 });
    [0.25, 0.75, 1.25].forEach((y, row) => {
      blk(1.46, 0.04, 0.5, C.grey, 0, y, 0.3, { m: 0.5 });
      for (let i = 0; i < 3; i++) blk(0.4, 0.24, 0.42, [C.blue, C.hazard, C.red, C.pine][(i + row) % 4], -0.48 + i * 0.48, y + 0.14, 0.32, { rx: 0.12, top: 0x1c1f24 });
    });
  },
  dishmast: () => {
    blk(0.9, 0.2, 0.9, C.concrete, 0, 0.1, 0.6); rod(0.1, 4.2, C.grey, 0, 2.3, 0.6, { seg: 6, r2: 0.06, m: 0.5 });
    blk(0.5, 0.9, 0.36, 0x8fa0ad, 0.5, 0.65, 0.6); blk(0.07, 0.07, 0.03, 0x58e06a, 0.4, 0.9, 0.79, { glow: 1.6, blink: 0.6 });
    for (const s of [-1, 1]) blk(0.12, 0.62, 0.07, C.white, s * 0.16, 3.9, 0.6, { ry: s * 0.5 });
    const spin = { at: [0, 3.2, 0.6], axis: Y, speed: 0.5 };
    rod(0.07, 0.24, C.white, 0, 3.2, 0.92, { ax: 'z', r2: 0.5, seg: 10, open: true, rx: -0.5, spin }); blk(0.03, 0.03, 0.4, C.grey, 0, 3.12, 0.78, { rx: -0.5, spin });
    rod(0.02, 0.5, C.grey, 0, 4.6, 0.6, { seg: 4 }); ball(0.09, 0xff3b30, 0, 4.62, 0.6, { glow: 2.2, blink: 0.45 });
  },
  solar: () => {
    for (const x of [-0.8, 0.8]) { blk(0.06, 1.1, 0.06, C.grey, x, 0.55, 0.14, { m: 0.5 }); blk(0.06, 0.4, 0.06, C.grey, x, 0.2, 1.1, { m: 0.5 }); blk(0.05, 0.05, 1.0, C.grey, x, 0.2, 0.62, { m: 0.5 }); }
    const rx = 0.62;
    blk(1.84, 0.05, 1.22, C.navy, 0, 0.76, 0.62, { rx, m: 0.85 });
    for (const x of [-0.46, 0, 0.46]) blk(0.02, 0.012, 1.22, 0xa9c4e8, x, 0.795, 0.635, { rx });
    blk(1.84, 0.012, 0.02, 0xa9c4e8, 0, 0.795, 0.635, { rx }); blk(1.9, 0.06, 0.04, C.steel, 0, 1.11, 0.13, { m: 0.8 });
  },

  // ---- Commercial Metropolis: the engine plant
  enginestand: () => {
    for (const z of [0.2, 0.8]) blk(1.2, 0.08, 0.08, C.red, 0, 0.1, z); blk(0.08, 0.08, 0.7, C.red, 0, 0.1, 0.5); blk(0.1, 0.62, 0.1, C.red, 0, 0.42, 0.5);
    blk(0.56, 0.4, 0.72, 0x8d99a6, 0, 0.92, 0.5, { m: 0.7 }); blk(0.4, 0.12, 0.6, C.iron, 0, 0.68, 0.5);
    for (const s of [-1, 1]) { blk(0.2, 0.15, 0.68, C.steel, s * 0.24, 1.14, 0.5, { rz: -s * 0.5, m: 0.9 }); rod(0.045, 0.6, C.copper, s * 0.38, 0.98, 0.5, { ax: 'z', seg: 5, m: 0.8 }); }
    blk(0.2, 0.1, 0.5, C.red, 0, 1.24, 0.5);
    rod(0.15, 0.06, C.iron, 0, 0.86, 0.9, { ax: 'z', seg: 8 }); rod(0.09, 0.06, C.iron, 0.2, 1.08, 0.9, { ax: 'z', seg: 6 });
  },
  toolchest: () => {
    blk(0.74, 0.1, 0.4, C.rubber, -0.42, 0.05, 0.3); blk(0.7, 0.1, 0.4, C.rubber, 0.44, 0.05, 0.3);
    blk(0.8, 1.05, 0.5, 0xd63a2f, -0.42, 0.63, 0.3); blk(0.76, 0.8, 0.5, 0xd63a2f, 0.44, 0.5, 0.3);
    blk(0.82, 0.04, 0.52, C.rubber, -0.42, 1.17, 0.3); blk(0.78, 0.04, 0.52, C.rubber, 0.44, 0.92, 0.3);
    for (const y of [0.3, 0.52, 0.74, 0.96]) blk(0.6, 0.035, 0.03, C.steel, -0.42, y, 0.56, { m: 0.9 });
    for (const y of [0.28, 0.5, 0.72]) blk(0.56, 0.035, 0.03, C.steel, 0.44, y, 0.56, { m: 0.9 });
    blk(0.4, 0.03, 0.07, C.steel, 0.4, 0.955, 0.3, { ry: 0.4, m: 0.9 });
  },
  forklift: () => {
    blk(1.25, 0.55, 0.95, C.hazard, -0.3, 0.55, 0.6); blk(0.45, 0.75, 0.95, 0xd99a1f, -1.0, 0.65, 0.6); blk(0.42, 0.34, 0.46, C.graphite, -0.45, 0.99, 0.6);
    for (const x of [-0.85, 0.2]) for (const z of [0.18, 1.02]) blk(0.06, 1.2, 0.06, C.iron, x, 1.45, z); blk(1.17, 0.05, 0.94, C.iron, -0.32, 2.07, 0.6);
    for (const z of [0.26, 0.94]) { blk(0.09, 2.0, 0.09, C.iron, 0.45, 1.05, z); blk(0.95, 0.05, 0.12, C.steel, 0.96, 0.16, z, { m: 0.8 }); }
    for (const y of [0.4, 1.3, 2.0]) blk(0.07, 0.07, 0.68, C.iron, 0.45, y, 0.6); blk(0.06, 0.5, 0.8, C.iron, 0.52, 0.45, 0.6);
    for (const [x, r] of [[-0.82, 0.24], [0.12, 0.28]]) for (const z of [0.14, 1.06]) rod(r, 0.2, C.rubber, x, r, z, { ax: 'z', seg: 8, cap: C.grey });
    rod(0.08, 0.11, C.orange, -0.75, 2.15, 0.3, { seg: 6, glow: 1.8, blink: 0.2 });
  },
  neongear: () => neon(bar => {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; bar(0.36, 0.06, C.cyan, Math.cos(a) * 0.42 - 0.5, Math.sin(a) * 0.42, a + Math.PI / 2); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; bar(0.16, 0.06, C.cyan, Math.cos(a) * 0.14 - 0.5, Math.sin(a) * 0.14, a + Math.PI / 2); }
    bar(0.9, 0.07, C.pink, 0.58, 0.3); bar(0.6, 0.07, 0xffb020, 0.43, 0.02); bar(0.9, 0.07, C.pink, 0.58, -0.26);
  }),
  neoncar: () => neon(bar => {
    bar(1.5, 0.07, C.cyan, 0, -0.2); bar(0.5, 0.07, C.cyan, -0.56, 0.06, 0.5); bar(0.7, 0.07, C.cyan, 0.05, 0.2); bar(0.45, 0.07, C.cyan, 0.58, 0.03, -0.75);
    for (const x of [-0.45, 0.45]) for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; bar(0.2, 0.06, C.pink, x + Math.cos(a) * 0.13, -0.38 + Math.sin(a) * 0.13, a + Math.PI / 2); }
    bar(0.3, 0.06, 0xffb020, 0.98, -0.02); bar(0.2, 0.06, 0xffb020, -1.0, -0.02);
  }),
  neonbot: () => neon(bar => {
    bar(0.8, 0.06, C.cyan, 0, 0.32); bar(0.8, 0.06, C.cyan, 0, -0.34); bar(0.06, 0.66, C.cyan, -0.4, 0); bar(0.06, 0.66, C.cyan, 0.4, 0);
    bar(0.16, 0.16, C.pink, -0.17, 0.08); bar(0.16, 0.16, C.pink, 0.17, 0.08); bar(0.36, 0.06, C.pink, 0, -0.18);
    bar(0.06, 0.2, 0xffb020, 0, 0.46); bar(0.12, 0.12, 0xffb020, 0, 0.6, 0.78);
    bar(0.2, 0.06, C.cyan, -0.6, 0); bar(0.2, 0.06, C.cyan, 0.6, 0);
  }),

  // ---- the automobile factory
  tyres: () => {
    const stack = (x, z, n) => {
      for (let i = 0; i < n; i++) rod(0.36, 0.23, i % 2 ? 0x26292e : C.rubber, x, 0.115 + i * 0.23, z, { seg: 8, open: i < n - 1, top: 0x2c3036 });
      disc(0.2, 0x0c0d0f, x, n * 0.23 + 0.004, z, { rx: -Math.PI / 2, seg: 8 });
    };
    stack(-0.38, 0.42, 5); stack(0.36, 0.4, 3);
    rod(0.36, 0.23, C.rubber, 0.3, 0.37, 0.82, { ax: 'z', seg: 8, cap: 0x2c3036, rx: -0.2 }); disc(0.2, C.steel, 0.3, 0.35, 0.94, { seg: 8, rx: -0.2, m: 0.9 });
  },
  carbody: () => {
    blk(2.2, 0.08, 0.9, C.iron, 0, 0.3, 0.66); for (const x of [-0.9, 0.9]) for (const z of [0.3, 1.02]) blk(0.12, 0.3, 0.12, C.hazard, x, 0.15, z);
    blk(2.5, 0.42, 1.14, C.red, 0, 0.62, 0.66, { tint: true }); blk(1.26, 0.36, 1.04, 0x243140, -0.12, 1.01, 0.66, { m: 0.8 }); blk(1.3, 0.06, 1.1, C.red, -0.12, 1.22, 0.66, { tint: 0.92 });
    for (const x of [-0.78, 0.78]) disc(0.27, 0x14161a, x, 0.5, 1.236, { seg: 8 });
    for (const z of [0.26, 1.06]) { blk(0.04, 0.12, 0.22, C.cream, 1.26, 0.66, z); blk(0.04, 0.1, 0.2, 0xc2352b, -1.26, 0.68, z); }
    blk(0.05, 0.12, 1.16, C.graphite, 1.26, 0.48, 0.66); blk(0.05, 0.12, 1.16, C.graphite, -1.26, 0.48, 0.66);
  },
  panelrack: () => {
    blk(1.9, 0.1, 0.72, C.iron, 0, 0.05, 0.4); for (const x of [-0.92, 0.92]) { for (const z of [0.08, 0.72]) blk(0.06, 1.55, 0.06, C.iron, x, 0.82, z); blk(0.06, 0.06, 0.7, C.iron, x, 1.6, 0.4); }
    [C.red, C.blue, C.white, C.hazard, C.teal].forEach((c, i) => { const x = -0.66 + i * 0.33; blk(0.05, 0.6, 0.62, c, x, 0.44, 0.4, { rz: -0.22 }); blk(0.05, 0.34, 0.5, 0x243140, x + 0.1, 0.9, 0.4, { rz: -0.22, m: 0.8 }); });
  },
  chargepost: () => {
    blk(0.44, 0.06, 0.34, C.slate, 0, 0.03, 0.22); blk(0.3, 1.4, 0.2, C.white, 0, 0.76, 0.2);
    blk(0.2, 0.22, 0.02, C.cyan, 0, 1.2, 0.31, { glow: 1.2 }); blk(0.04, 0.8, 0.02, C.teal, -0.1, 0.6, 0.31, { glow: 1.4 });
    rod(0.05, 0.16, C.slate, 0.2, 0.9, 0.22, { ax: 'x', seg: 5 }); blk(0.03, 0.6, 0.03, C.rubber, 0.26, 0.6, 0.24, { rz: 0.1 });
  },

  // ---- the robotics factory
  chargedock: () => {
    blk(2.9, 0.06, 1.0, C.slate, 0, 0.03, 0.55);
    [-0.95, 0, 0.95].forEach((x, i) => {
      blk(0.3, 1.5, 0.2, C.white, x, 0.75, 0.14); blk(0.06, 1.1, 0.02, C.cyan, x, 0.85, 0.25, { glow: 1.5 });
      rod(0.33, 0.03, C.cyan, x, 0.075, 0.66, { seg: 6, glow: i === 1 ? 1.4 : 0.9 });
      if (i === 1) return;   // the middle one is out working
      blk(0.36, 0.14, 0.3, C.graphite, x, 0.17, 0.66); blk(0.34, 0.4, 0.28, 0xcfd8e3, x, 0.44, 0.66, { m: 0.4 }); blk(0.28, 0.22, 0.24, C.white, x, 0.76, 0.66);
      blk(0.2, 0.07, 0.02, C.cyan, x, 0.78, 0.785, { glow: 1.7 }); blk(0.025, 0.16, 0.025, C.grey, x + 0.08, 0.95, 0.66);
    });
  },
  armcrate: () => {
    blk(1.4, 0.1, 1.0, C.plank2, 0, 0.05, 0.55); blk(1.4, 0.5, 0.05, C.plank, 0, 0.35, 0.08); for (const x of [-0.68, 0.68]) blk(0.05, 0.5, 1.0, C.plank3, x, 0.35, 0.55);
    rod(0.22, 0.16, C.iron, -0.2, 0.18, 0.55, { seg: 8 }); blk(0.26, 0.3, 0.26, C.orange, -0.2, 0.4, 0.55);
    blk(0.16, 0.72, 0.16, C.orange, 0.0, 0.78, 0.55, { rz: -0.6 }); rod(0.12, 0.2, C.iron, 0.2, 1.08, 0.55, { ax: 'z', seg: 6 });
    blk(0.13, 0.56, 0.13, C.orange, 0.36, 0.9, 0.55, { rz: 0.95 }); blk(0.2, 0.08, 0.12, C.iron, 0.58, 0.72, 0.55);
  },
  dronepad: () => {
    rod(0.58, 0.06, C.slate, 0, 0.03, 0.66, { seg: 10, top: 0x4a5462 });
    blk(0.06, 0.012, 0.5, C.white, -0.18, 0.066, 0.66); blk(0.06, 0.012, 0.5, C.white, 0.18, 0.066, 0.66); blk(0.36, 0.012, 0.06, C.white, 0, 0.066, 0.66);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; gem(0.05, 0.04, C.cyan, Math.cos(a) * 0.5, 0.08, 0.66 + Math.sin(a) * 0.5, { glow: 1.6 }); }
    for (const x of [-0.14, 0.14]) blk(0.03, 0.2, 0.4, C.grey, x, 0.17, 0.66); blk(0.3, 0.12, 0.3, C.white, 0, 0.33, 0.66);
    for (const s of [-1, 1]) blk(0.86, 0.03, 0.05, C.graphite, 0, 0.36, 0.66, { ry: s * Math.PI / 4 });
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.785, x = Math.cos(a) * 0.43, z = 0.66 + Math.sin(a) * 0.43; blk(0.34, 0.012, 0.045, 0xb9c4d0, x, 0.4, z, { spin: { at: [x, 0.4, z], axis: Y, speed: 22 + i } }); }
  },

  // ---- the department store
  showcase: () => {
    blk(2.4, 0.5, 0.8, C.wine, 0, 0.25, 0.45); blk(2.44, 0.05, 0.84, C.gold, 0, 0.52, 0.45, { m: 0.9 }); blk(2.4, 1.4, 0.06, C.cream, 0, 1.25, 0.08);
    for (const x of [-1.17, 1.17]) blk(0.06, 1.45, 0.06, C.gold, x, 1.27, 0.82, { m: 0.9 }); blk(2.5, 0.14, 0.9, C.wine, 0, 2.03, 0.45);
    blk(2.2, 0.04, 0.1, C.lamp, 0, 1.95, 0.7, { glow: 1.4 });
    const gift = (x, s, c, ribbon) => { blk(s, s, s, c, x, 0.55 + s / 2, 0.45); blk(s + 0.02, s + 0.02, 0.07, ribbon, x, 0.55 + s / 2, 0.45); blk(0.07, s + 0.02, s + 0.02, ribbon, x, 0.55 + s / 2, 0.45); };
    gift(-0.75, 0.44, C.magenta, C.gold); gift(-0.25, 0.3, C.teal, C.white); gift(0.85, 0.36, C.red, C.gold);
    blk(0.3, 0.36, 0.24, 0xcfd8e3, 0.3, 0.75, 0.45, { m: 0.4 }); blk(0.24, 0.2, 0.2, C.white, 0.3, 1.04, 0.45); blk(0.16, 0.05, 0.02, C.cyan, 0.3, 1.05, 0.555, { glow: 1.6 });
  },
  giftstack: () => {
    const gift = (x, y, z, s, c, ribbon, ry = 0, tint = false) => { blk(s, s, s, c, x, y + s / 2, z, { ry, tint }); blk(s + 0.02, s + 0.02, 0.07, ribbon, x, y + s / 2, z, { ry }); blk(0.07, s + 0.02, s + 0.02, ribbon, x, y + s / 2, z, { ry }); };
    gift(-0.32, 0, 0.36, 0.56, C.magenta, C.gold, 0.1, true); gift(0.3, 0, 0.34, 0.5, C.teal, C.white, -0.15); gift(0.0, 0, 0.78, 0.4, C.gold, C.wine, 0.4);
    gift(-0.06, 0.56, 0.36, 0.42, C.white, C.red, 0.3); gift(-0.04, 0.98, 0.36, 0.26, C.red, C.gold, -0.2);
    gem(0.07, 0.06, C.gold, -0.04, 1.3, 0.36);
  },
  kiosk: () => {
    blk(2.0, 1.0, 1.0, C.wine, 0, 0.5, 0.62); blk(2.2, 0.08, 1.2, C.walnut, 0, 1.04, 0.62); blk(1.9, 0.5, 0.03, C.cream, 0, 0.5, 1.125);
    for (const x of [-1.0, 1.0]) for (const z of [0.12, 1.12]) blk(0.07, 1.3, 0.07, C.cream, x, 1.72, z);
    for (let i = 0; i < 5; i++) blk(0.46, 0.06, 1.34, i % 2 ? C.cream : C.wine, -0.92 + i * 0.46, 2.36, 0.67, { rx: 0.16 });
    blk(1.5, 0.3, 0.06, C.graphite, 0, 2.5, 0.2); blk(1.2, 0.1, 0.03, C.lamp, 0, 2.5, 0.24, { glow: 1.6 });
    const gift = (x, s, c, ribbon) => { blk(s, s, s, c, x, 1.08 + s / 2, 0.8); blk(s + 0.02, s + 0.02, 0.06, ribbon, x, 1.08 + s / 2, 0.8); };
    gift(-0.6, 0.3, C.magenta, C.gold); gift(-0.15, 0.22, C.teal, C.white); gift(0.5, 0.34, C.gold, C.wine);
    gem(0.08, 0.1, C.lamp, 0, 2.1, 0.62, { glow: 1.8 });
  },
  bunting: () => {
    for (const x of [-2.0, 2.0]) { rod(0.04, 2.7, C.white, x, 1.35, 0.15, { seg: 5 }); blk(0.3, 0.1, 0.3, C.slate, x, 0.05, 0.15); }
    blk(4.0, 0.02, 0.02, C.graphite, 0, 2.6, 0.15);
    [C.magenta, C.gold, C.teal, C.white, C.red, C.gold, C.teal, C.magenta, C.white].forEach((c, i) => { const x = -1.76 + i * 0.44; add(TRI_DOWN, c, 0.34, 0.4, 1, x, 2.59, 0.15, { sway: { from: [x, 2.59, 0.15], dir: Z, amp: 2.2 } }); });
  },
  balloons: () => {
    blk(0.22, 0.16, 0.22, C.slate, 0, 0.08, 0.3);
    [[-0.16, 2.05, C.red, true], [0.02, 2.25, C.gold, false], [0.18, 1.95, C.cyan, false]].forEach(([x, y, c, tint], i) => {
      const sway = { from: [0, 0.16, 0.3], dir: i % 2 ? X : Z, amp: 0.3 };
      blk(0.012, y - 0.16, 0.012, C.white, x / 2, (y + 0.16) / 2, 0.3, { rz: -Math.atan2(x, y - 0.16), sway });
      ball(0.2, c, x, y + 0.18, 0.3, { sy: 1.2, tint, sway });
    });
  },
  bollardlights: () => { for (const x of [-1.0, 0, 1.0]) { rod(0.1, 0.86, C.slate, x, 0.43, 0.2, { seg: 6, top: C.steel }); rod(0.104, 0.1, C.cyan, x, 0.7, 0.2, { seg: 6, open: true, glow: 1.5 }); } },
};
