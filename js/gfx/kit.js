// The parts kit the machines are built from: plates, rods, pipes, tanks, motors, gears, cabinets, gauges, frames,
// rollers and robot arms, each in a few lines of code and in a handful of surfaces.
//
// The surfaces are what keeps a machine cheap to draw. After a machine is built, every still part of the same surface
// is joined into one mesh (js/engine/bake.js), whatever its colour. So the kit keeps to a short list of them:
//   - painted block (box() with its soft edge shading): bodies, beams, plates;
//   - painted round (cyl() and the custom shapes below, made by skin()): tanks, pipes, domes, gears;
//   - PANEL: painted sheet steel with seams, for the big body of a machine;
//   - STEEL: bright machined metal, the same for blocks and rounds;
//   - BRASS: polished yellow metal, for the fine trades.
// A machine built from these ends up as four or five meshes plus whatever glows or moves.
//
// Moving parts are built in a Group and handed to rig(): it joins the group's own parts in the same way, then marks
// it as moving so that the machine's bake leaves it alone. Rig the innermost joint first.
import * as THREE from 'three';
import { box, cyl, lit } from '../world.js';
import { panel } from '../textures.js';
import { sharedMaterial, shape } from '../engine/materials.js';
import { bake, moving } from '../engine/bake.js';
import { merge } from '../models.js';
import { productShape } from './products.js';
import { stackBase } from '../items3d.js';

// ------------------------------------------------------------------ surfaces and colours
export const STEEL = { metalness: 0.85, roughness: 0.3, envMapIntensity: 0.85, map: null };
export const BRASS = { metalness: 0.6, roughness: 0.3, envMapIntensity: 0.8, map: null };   // fully metallic, it mirrors the green ground and turns olive
export const PANEL = () => panel();
export const GLASS = { map: null, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.3, envMapIntensity: 1, depthWrite: false };
/** The few colours every machine shares, so the yards read as one world. */
export const INK = {
  steel: 0xc9cfd5, iron: 0x3c4149, dark: 0x272b31, rubber: 0x1d1f23, hazard: 0xf2b630, concrete: 0xb3aea4,
  brick: 0xa4533a, water: 0x3f94c9, wood: 0xa8743f, walnut: 0x6b4a2f, cream: 0xf1e8d2, white: 0xeef0f2,
  copper: 0xc7744a, gold: 0xf2c24a, glass: 0xbfe6ff,
};

/** A shared material for a custom shape: the same as cyl() gives, so they are joined together. */
export const skin = (color, o = {}) => sharedMaterial({ color, roughness: 0.82, metalness: 0, envMapIntensity: 0.42, ...o });

/** Something that glows and changes while the machine runs (fire, molten metal, a core): a material of its own. */
export const hot = color => new THREE.MeshBasicMaterial({ color });

// ------------------------------------------------------------------ placing
/** Put `o` at (x, y, z) under `p`; returns `o`. */
export function put(p, o, x = 0, y = 0, z = 0) { o.position.set(x, y, z); p.add(o); return o; }
/** A block w by h by d with its middle at (x, y, z). */
export const block = (p, w, h, d, color, x, y, z, o) => put(p, box(w, h, d, color, o), x, y, z);
const TURN = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] };
/** A cylinder of radius r and length len along an axis ('x', 'y' or 'z'), its middle at (x, y, z). r2 = the other end. */
export function rod(p, r, len, color, x, y, z, axis = 'y', o, seg = 10, r2 = r) {
  const m = cyl(r, r2, len, color, seg, o); m.rotation.set(...TURN[axis]);
  return put(p, m, x, y, z);
}
/** A mesh of a custom shape in a shared material. */
export function part(p, geo, color, x, y, z, o) {
  const m = new THREE.Mesh(geo, skin(color, o)); m.castShadow = true; m.receiveShadow = true;
  return put(p, m, x, y, z);
}
/** A group at (x, y, z) under `p`, for a part that moves. */
export const pivot = (p, x = 0, y = 0, z = 0) => put(p, new THREE.Group(), x, y, z);
/** Join a moving group's own parts and mark it as moving (rig the innermost joints first). */
export function rig(g) { bake(g); return moving(g); }
/** Note a place on a machine that smokes while it works, in the machine's own space. */
export function smokes(g, x, y, z, smoke = {}) { (g.userData.chimneys ||= []).push({ x, y, z, smoke }); }

// ------------------------------------------------------------------ shapes, made once
export const GEO = {
  /** The top half of a ball. */
  dome: (r, seg = 12) => shape(`kit-dome|${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(3, seg >> 2), 0, Math.PI * 2, 0, Math.PI / 2)),
  /** A heap of loose material, faceted. */
  heap: () => shape('kit-heap', () => new THREE.DodecahedronGeometry(0.42, 0)),
  ball: (r, seg = 8) => shape(`kit-ball|${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1))),
  /** A ring lying in the x-y plane (facing +z). */
  ring: (r, tube, seg = 16) => shape(`kit-ring|${r}|${tube}|${seg}`, () => new THREE.TorusGeometry(r, tube, 6, seg)),
  cone: (r, h, seg = 8) => shape(`kit-cone|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  /** A toothed disc facing +z (spins around z): a saw blade or a gear. */
  gear: (r, teeth, depth, inner = 0.85) => shape(`kit-gear|${r}|${teeth}|${depth}|${inner}`, () => {
    const s = new THREE.Shape(), at = (a, rr) => [Math.cos(a) * rr, Math.sin(a) * rr];
    for (let k = 0; k < teeth; k++) {
      const a = k / teeth * Math.PI * 2, b = (k + 0.5) / teeth * Math.PI * 2;
      k ? s.lineTo(...at(a, r)) : s.moveTo(...at(a, r));
      s.lineTo(...at(a + 0.35 / teeth * Math.PI * 2, r)); s.lineTo(...at(b, r * inner)); s.lineTo(...at(b + 0.35 / teeth * Math.PI * 2, r * inner));
    }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth / 2);
  }),
  /** A saw blade facing +z: hooked teeth cut from one outline. */
  blade: (r, teeth = 16, depth = 0.05) => shape(`kit-blade|${r}|${teeth}|${depth}`, () => {
    const s = new THREE.Shape(), at = (a, rr) => [Math.cos(a) * rr, Math.sin(a) * rr];
    for (let k = 0; k < teeth; k++) {
      const tip = k / teeth * Math.PI * 2, gullet = (k + 0.75) / teeth * Math.PI * 2;
      k ? s.lineTo(...at(tip, r)) : s.moveTo(...at(tip, r));
      s.lineTo(...at(gullet, r * 0.82));
    }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  }),
  /** An arch facing +z, its foot at y = 0: a doorway, an oven mouth. */
  arch: (w, h, depth) => shape(`kit-arch|${w}|${h}|${depth}`, () => {
    const s = new THREE.Shape(), r = w / 2, leg = Math.max(0, h - r);
    s.moveTo(-r, 0); s.lineTo(-r, leg); s.absarc(0, leg, r, Math.PI, 0, true); s.lineTo(r, 0); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 5 }).translate(0, 0, -depth / 2);
  }),
  /** A slanted stripe facing +z, for hazard bands. */
  stripe: (w, h, slant, depth = 0.01) => shape(`kit-stripe|${w}|${h}|${slant}|${depth}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - slant / 2, -h / 2); s.lineTo(w / 2 - slant / 2, -h / 2); s.lineTo(w / 2 + slant / 2, h / 2); s.lineTo(-w / 2 + slant / 2, h / 2); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  }),
  /** A faceted boulder of radius 1, to be stretched: a rock face, a lump of ore. */
  rock: () => shape('kit-rock', () => new THREE.DodecahedronGeometry(1, 0)),
  /** A cut stone of radius r, standing on its point. */
  gem: (r = 1) => shape(`kit-gem|${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  /** Half a drum lying along z: a hood, a curved roof. */
  vault: (r, len, seg = 10, open = false) => shape(`kit-vault|${r}|${len}|${seg}|${open}`, () => new THREE.CylinderGeometry(r, r, len, seg, 1, open, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2)),
};

// ------------------------------------------------------------------ parts
/** A pipe through a list of points [[x, y, z], ...], with a joint at every bend. */
export function pipe(p, pts, r, color, o) {
  const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i + 1 < pts.length; i++) {
    a.fromArray(pts[i]); b.fromArray(pts[i + 1]); d.subVectors(b, a);
    const len = d.length();
    const m = put(p, cyl(r, r, len, color, 8, o), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.setFromUnitVectors(up, d.normalize());
    if (i > 0) part(p, GEO.ball(r * 1.18, 8), color, a.x, a.y, a.z, o);
  }
}
/** An upright tank: its body from y0 up h, a dome on top, and bands in `band`. Returns the top. */
export function tank(p, r, h, color, x, y0, z, { band = null, bands = [0.3, 0.7], o, seg = 14, cap = 0.5 } = {}) {
  rod(p, r, h, color, x, y0 + h / 2, z, 'y', o, seg);
  const top = part(p, GEO.dome(r, seg), color, x, y0 + h, z, o); top.scale.y = cap;
  if (band != null) for (const k of bands) rod(p, r * 1.03, 0.12, band, x, y0 + h * k, z, 'y', undefined, seg);
  return y0 + h + r * cap;
}
/** A chimney from y0 up h, slightly wider at its foot, with a dark collar at the top. Returns where its smoke starts. */
export function chimney(p, r, h, color, x, y0, z, o) {
  rod(p, r, h, color, x, y0 + h / 2, z, 'y', o, 10, r * 1.15);
  rod(p, r * 1.22, 0.16, INK.dark, x, y0 + h - 0.08, z, 'y', undefined, 10);
  return y0 + h + 0.2;
}
/** An electric motor lying along x: ribbed body, end bell, terminal box and shaft. */
export function motor(p, color, x, y, z, len = 0.7, r = 0.26, dir = 1) {
  rod(p, r, len, color, x, y, z, 'x', undefined, 12);
  for (const k of [-0.3, 0, 0.3]) rod(p, r * 1.08, 0.06, color, x + k * len, y, z, 'x', undefined, 12);
  rod(p, r * 0.8, 0.12, INK.iron, x - dir * (len / 2 + 0.05), y, z, 'x', undefined, 12);
  block(p, r * 0.9, r * 0.6, r * 0.9, INK.iron, x, y + r + r * 0.25, z);
  rod(p, r * 0.22, 0.25, INK.steel, x + dir * (len / 2 + 0.1), y, z, 'x', STEEL, 8);
  block(p, len * 0.8, 0.1, r * 1.6, INK.iron, x, y - r - 0.03, z);
}
/** A control cabinet standing on y0, its front at z + d / 2: a lit screen and two buttons. */
export function cabinet(p, color, x, y0, z, { w = 0.7, h = 1.0, d = 0.45, screen = 0x7fe8ff, glow = 0x39e3a0 } = {}) {
  block(p, w, h, d, color, x, y0 + h / 2, z, { round: 0.04 });
  block(p, w * 0.75, h * 0.3, 0.03, INK.dark, x, y0 + h * 0.7, z + d / 2 + 0.01);
  lit(block(p, w * 0.62, h * 0.2, 0.02, screen, x, y0 + h * 0.7, z + d / 2 + 0.03, { map: null }), glow, 0.45);
  rod(p, 0.05, 0.05, 0xe0452f, x - w * 0.2, y0 + h * 0.35, z + d / 2 + 0.02, 'z', undefined, 8);
  rod(p, 0.05, 0.05, 0x3fc46a, x + w * 0.05, y0 + h * 0.35, z + d / 2 + 0.02, 'z', undefined, 8);
}
/** A round gauge facing +z. */
export function gauge(p, x, y, z, r = 0.12) {
  rod(p, r, 0.06, INK.steel, x, y, z, 'z', STEEL, 12);
  lit(rod(p, r * 0.8, 0.02, 0xf6f3e8, x, y, z + 0.03, 'z', undefined, 12), 0xfff3c8, 0.12);
  block(p, r * 0.1, r * 0.7, 0.01, 0xd63a2f, x + r * 0.15, y + r * 0.2, z + 0.045).rotation.z = -0.6;
}
/** A lantern with its middle at (x, y, z): a dark knob and foot around a pane that glows after dark. Returns the pane. */
export function lantern(p, x, y, z, { glow = 0xffd27a, pane = 0xfff1c2, byDay = 0.08, s = 1 } = {}) {
  block(p, 0.14 * s, 0.07 * s, 0.14 * s, INK.dark, x, y + 0.165 * s, z);   // small, so the pane shows around it from above
  block(p, 0.3 * s, 0.05 * s, 0.3 * s, INK.dark, x, y - 0.155 * s, z);
  return put(p, lit(box(0.28 * s, 0.26 * s, 0.28 * s, pane, { map: null, round: 0.04 * s }), glow, byDay), x, y, z);
}
/** Four legs and a top frame: a table, a stand, a gantry. Legs are `post` thick. */
export function frame(p, w, h, d, color, x, y0, z, { post = 0.12, beam = true, o } = {}) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(p, post, h, post, color, x + sx * (w - post) / 2, y0 + h / 2, z + sz * (d - post) / 2, o);
  if (beam) {
    for (const sz of [-1, 1]) block(p, w, post, post, color, x, y0 + h - post / 2, z + sz * (d - post) / 2, o);
    for (const sx of [-1, 1]) block(p, post, post, d, color, x + sx * (w - post) / 2, y0 + h - post / 2, z, o);
  }
}
/** A band of hazard stripes along x, in front of z. */
export function hazard(p, w, x, y, z, h = 0.1, n = 8) {
  block(p, w, h, 0.03, INK.hazard, x, y, z);
  const step = w / n;
  for (let i = 0; i < n; i += 2) part(p, GEO.stripe(step, h, h * 0.8), INK.dark, x - w / 2 + step * (i + 1), y, z + 0.016);
}
/** A roller lying along z (goods run over it along x), in a group of its own that can turn. */
export function roller(p, r, len, color, x, y, z) {
  const g = pivot(p, x, y, z);
  rod(g, r, len, color, 0, 0, 0, 'z', STEEL, 10);
  block(g, r * 2.02, 0.03, len * 0.96, INK.iron, 0, 0, 0, STEEL);   // a flat along it, so that it is seen to turn
  return rig(g);
}
/** A spoked wheel facing +z: a flywheel or a hand wheel, in a group that turns around z. */
export function wheel(p, r, color, x, y, z, { spokes = 5, tube = r * 0.12, hub = r * 0.2, o = STEEL } = {}) {
  const g = pivot(p, x, y, z);
  part(g, GEO.ring(r, tube, 18), color, 0, 0, 0, o);
  for (let i = 0; i < spokes; i++) {
    const s = block(g, r * 0.12, r, r * 0.12, color, 0, 0, 0, o);
    const a = i / spokes * Math.PI * 2; s.rotation.z = a; s.position.set(-Math.sin(a) * r / 2, Math.cos(a) * r / 2, 0);
  }
  rod(g, hub, tube * 2.4, INK.iron, 0, 0, 0, 'z', undefined, 10);
  return rig(g);
}
/** Many copies of one product as a single draw: [[x, y, z, turnY, scale], ...] with y at the foot of each. */
export function pile(p, type, spots) {
  const s = productShape(type), m = new THREE.InstancedMesh(s.geo, s.mat, spots.length);
  const base = stackBase(type), _m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  spots.forEach(([x, y, z, turn = 0, k = 1, tilt = 0], i) => m.setMatrixAt(i, _m.compose(v.set(x, y + base * k, z), q.setFromEuler(e.set(tilt, turn, 0)), sc.setScalar(k))));
  m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere();
  p.add(m); return m;
}
/** Several glowing pieces joined into one mesh of one glow: [{ geo, at, turn }]. */
export function glowing(p, parts, color, glow, byDay = 0.6) {
  const m = new THREE.Mesh(merge(parts.map(q => ({ color, ...q }))), skin(0xffffff, { vertexColors: true, map: null }));
  return p.add(lit(m, glow, byDay)), m;
}

/**
 * An industrial robot arm standing at (x, y0, z): base, turret, upper arm, forearm and a tool.
 * @param tool  'grip' (two fingers), 'weld' (a torch) or 'drive' (a nut runner)
 * @returns { pose(yaw, shoulder, elbow, wrist) } in radians; 0, 0, 0 stands straight up
 */
export function robotArm(p, color, x, y0, z, { upper = 1.0, fore = 0.85, tool = 'grip', face = 0 } = {}) {
  const ARM = { map: null, roughness: 0.45, metalness: 0.2 };
  rod(p, 0.34, 0.22, INK.iron, x, y0 + 0.11, z, 'y', undefined, 12, 0.38);
  const turret = pivot(p, x, y0 + 0.22, z); turret.rotation.y = face;
  rod(turret, 0.26, 0.32, color, 0, 0.16, 0, 'y', ARM, 12);
  rod(turret, 0.17, 0.5, INK.iron, 0, 0.42, 0, 'z', ARM, 12);
  const shoulder = pivot(turret, 0, 0.42, 0);
  block(shoulder, 0.24, upper, 0.24, color, 0, upper / 2, 0, ARM);
  rod(shoulder, 0.14, 0.42, INK.iron, 0, upper, 0, 'z', ARM, 12);
  const elbow = pivot(shoulder, 0, upper, 0);
  block(elbow, 0.17, fore, 0.18, color, 0, fore / 2, 0, ARM);
  rod(elbow, 0.12, 0.14, INK.iron, 0, fore + 0.05, 0, 'y', ARM, 10);
  const head = pivot(elbow, 0, fore + 0.1, 0);
  if (tool === 'weld') {
    rod(head, 0.07, 0.3, INK.iron, 0, 0.15, 0, 'y', ARM, 8);
    rod(head, 0.02, 0.18, INK.copper, 0, 0.36, 0, 'y', STEEL, 6, 0.045);
  } else if (tool === 'drive') {
    rod(head, 0.1, 0.22, INK.iron, 0, 0.11, 0, 'y', ARM, 10);
    rod(head, 0.035, 0.16, INK.steel, 0, 0.3, 0, 'y', STEEL, 6);
  } else {
    block(head, 0.3, 0.08, 0.14, INK.iron, 0, 0.04, 0, ARM);
    for (const s of [-1, 1]) block(head, 0.05, 0.2, 0.1, INK.steel, s * 0.11, 0.18, 0, STEEL);
  }
  rig(head); rig(elbow); rig(shoulder); rig(turret);
  return {
    pose(yaw, a, b, c = 0) { turret.rotation.y = face + yaw; shoulder.rotation.z = a; elbow.rotation.z = b; head.rotation.z = c; },
  };
}
