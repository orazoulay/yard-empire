// The company's emblem in the yards: the one picture of it (an emblem in white on the company's colour, painted on a
// canvas, no file), the flag that flies it in every yard and the badge on the trucks.
//
// One picture, two materials (the cloth that waves, the badge that does not) and two shapes serve every flag and every
// truck: a flag is one draw, a badge one more on a truck. Changing the emblem or its colour paints the same picture again; nothing is made and nothing is freed. The
// flag's cloth waves on the graphics chip, by the same wind as the trees, and hangs still on the low graphics level
// and for players who asked for less motion (as the flags of the yards' dressing do).
/* global Path2D */
import * as THREE from 'three';
import { mat, wind } from '../world.js';
import { EMBLEMS } from '../data/looks.js';
import { life } from './props.js';

const W = 192, H = 160, CLOTH = 128;   // the picture: the cloth on top (3 by 2), and under it a strip of the staff's iron and the knob's gold
const IRON = '#3a3f46', BRASS = '#d9b23c';
const POLE = { height: 4.7, cloth: [1.38, 0.92] };   // a flag stands on a lamp post (3 m): its staff goes on above the lamp
let made = null;

function make() {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  map.userData.shared = true;   // one picture for every flag and badge: it stays when a flag goes
  const material = mat(0xffffff, { map, roughness: 0.8, side: THREE.DoubleSide }), still = mat(0xffffff, { map, roughness: 0.6 });
  material.userData.shared = true; still.userData.shared = true;
  material.onBeforeCompile = shader => {   // the cloth waves: the further from the staff, the more
    shader.uniforms.uWind = wind; shader.uniforms.uLife = life;
    shader.vertexShader = 'uniform float uWind;\nuniform float uLife;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      float flagOut = smoothstep(0.05, 0.5, position.x);
      transformed.z += sin(uWind * 3.2 - position.x * 5.0) * 0.11 * flagOut * uLife;`);
  };
  // the flag: a staff, a knob on top and the cloth, in one shape. The staff and the knob take their colour from the strip.
  const u = px => px / W, v = py => 1 - py / H;
  const paintUv = (geo, x, y) => { const a = geo.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, u(x), v(y)); return geo; };
  const [cw, ch] = POLE.cloth, top = POLE.height;
  const cloth = new THREE.PlaneGeometry(cw, ch, 8, 1).translate(0.04 + cw / 2, top - 0.08 - ch / 2, 0);
  { const a = cloth.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i), 1 - (1 - a.getY(i)) * CLOTH / H); }
  const staff = paintUv(new THREE.CylinderGeometry(0.035, 0.04, top - 2.9, 6).translate(0, (top + 2.9) / 2, 0), 24, 144);
  const knob = paintUv(new THREE.SphereGeometry(0.08, 8, 6).translate(0, top + 0.05, 0), 144, 144);
  const flag = joinGeometries([staff, knob, cloth]);
  // the badge of a truck: the emblem on the roof of the cab and on both doors, in one shape (the truck's own space)
  const face = (w, h) => { const g = new THREE.PlaneGeometry(w, h), a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, (1 / 6) + a.getX(i) * (2 / 3), 1 - (1 - a.getY(i)) * CLOTH / H); return g; };
  const badge = joinGeometries([
    face(0.76, 0.76).rotateX(-Math.PI / 2).translate(0, 1.532, 1.25),
    face(0.62, 0.62).rotateY(Math.PI / 2).translate(0.757, 1.02, 1.22),
    face(0.62, 0.62).rotateY(-Math.PI / 2).translate(-0.757, 1.02, 1.22),
  ]);
  flag.userData.shared = true; badge.userData.shared = true;
  return (made = { canvas, map, material, still, flag, badge, shown: '' });
}

/** Several shapes as one (positions, normals and uv; the parts are freed). */
function joinGeometries(parts) {
  const pos = [], nor = [], uv = [];
  for (const part of parts) {
    const g = part.index ? part.toNonIndexed() : part, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i)); }
    if (g !== part) g.dispose();
    part.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere(); out.boundingSphere.radius += 0.2;   // room for the cloth to wave in
  return out;
}

/**
 * Paint the picture: the emblem `id` (js/data/looks.js, EMBLEMS) in white on `colour`; an emblem the game does not
 * know is the colour alone, as the Headquarters shows no shape for it (js/icons.js, emblemIcon). Asked for what is
 * painted already, it does nothing.
 */
export function paintEmblem(id, colour) {
  const e = made || make(), key = `${id}:${colour}`;
  if (key === e.shown) return;
  e.shown = key;
  const g = e.canvas.getContext('2d'), css = '#' + colour.toString(16).padStart(6, '0');
  g.fillStyle = css; g.fillRect(0, 0, W, CLOTH);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, W, 5); g.fillRect(0, CLOTH - 5, W, 5);   // a white band along the top and the bottom
  g.fillStyle = IRON; g.fillRect(0, CLOTH, W / 2, H - CLOTH); g.fillStyle = BRASS; g.fillRect(W / 2, CLOTH, W / 2, H - CLOTH);
  if (Object.hasOwn(EMBLEMS, id)) {
    const size = 94, s = size / 24;
    g.save(); g.translate((W - size) / 2, (CLOTH - size) / 2); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.translate(0.6, 0.7); g.fill(new Path2D(EMBLEMS[id]), 'evenodd');   // a shadow under it: it reads on a pale colour too
    g.fillStyle = '#ffffff'; g.translate(-0.6, -0.7); g.fill(new Path2D(EMBLEMS[id]), 'evenodd');
    g.restore();
  }
  e.map.needsUpdate = true;
}

/** A flag with the company's emblem, its staff standing at the group's place. Its shape and material are shared: nothing of it needs freeing. */
export function makeFlag() {
  const e = made || make(), m = new THREE.Mesh(e.flag, e.material);
  m.castShadow = false; m.receiveShadow = false; m.name = 'emblem-flag';
  return m;
}
/** The emblem for a truck, in the truck's own space: on the roof of its cab and on both doors. It takes the shade as the cab does, or it would glow in it. */
export function makeBadge() {
  const e = made || make(), m = new THREE.Mesh(e.badge, e.still);
  m.castShadow = false; m.receiveShadow = true; m.name = 'emblem-badge';
  return m;
}
