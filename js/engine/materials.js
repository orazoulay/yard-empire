// @ts-check
// Shared materials and shapes: what many objects in the yards are made of, made once.
//
// A yard is built from hundreds of small blocks and cylinders, and most of them are alike: the same grey steel, the
// same painted panel, the same 0.2 by 0.2 post. Each used to get a material and a shape of its own, so the renderer
// switched state for every one of them and the graphics chip held hundreds of copies of the same box. Here a material
// is looked up by what it is made of, and a box or a cylinder by its size, and handed out again.
//
// The rule for whoever takes one: a shared material or shape is never changed afterwards. Something that changes its
// colour or glow at run time asks for its own (mat() in js/world.js, or `unique: true`), or for a glowing variant here.
import * as THREE from 'three';

const standard = new Map(), shapes = new Map();
let asked = 0;

/** A text that is the same for two sets of material options exactly when they would make the same material. */
function keyOf(params) {
  return Object.keys(params).filter(k => params[k] != null).sort().map(k => {   // map: null and no map are the same material
    const v = params[k];
    const s = v == null ? '' : v.isTexture ? 't' + v.id : v.isColor ? 'c' + v.getHex() : typeof v === 'number' ? String(+v.toFixed(4)) : String(v);
    return k + '=' + s;
  }).join(';');
}

/**
 * A MeshStandardMaterial with these options, shared with everything else that asked for the same.
 * @param params  the options of a MeshStandardMaterial (colour as a number, textures, roughness and so on)
 */
export function sharedMaterial(params) {
  asked++;
  const key = keyOf(params);
  let m = standard.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(params);
    m.userData.shared = true; m.userData.key = key;
    standard.set(key, m);
  }
  return m;
}

const glows = new Map();
/**
 * The same material, glowing in `glow` after dark (js/sky.js turns every glowing material up at night). A shared
 * material gets a shared glowing twin, made once for each colour of glow; one of its own is changed in place.
 * @param byDay  how much of the glow shows by day (0 = none)
 * @param list   the list js/sky.js walks (GLOW in js/world.js); each material goes on it once
 */
export function glowing(material, glow, byDay, list) {
  let m = material;
  if (material.userData.shared) {
    const key = material.userData.key + '|glow=' + glow + '|' + byDay;
    m = glows.get(key);
    if (!m) { m = material.clone(); m.userData = { shared: true, key }; glows.set(key, m); }
  }
  m.emissive.setHex(glow); m.emissiveIntensity = byDay; m.userData.byDay = byDay;
  if (!m.userData.glowing) { m.userData.glowing = true; list.push(m); }
  return m;
}

/** A shape made once for each set of numbers: box(w, h, d) and cylinder(rt, rb, h, seg) here, others through `shape`. */
export function shape(key, make) {
  let g = shapes.get(key);
  if (!g) { g = make(); g.userData.shared = true; shapes.set(key, g); }
  return g;
}
export const boxShape = (w, h, d) => shape(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cylinderShape = (rt, rb, h, seg = 10) => shape(`cyl|${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));

/**
 * Take an object out of the scene for good and free what only it used. Shared materials, shapes and textures stay:
 * the next yard, machine or fence uses them again.
 */
export function release(root) {
  root.parent?.remove(root);
  root.traverse(o => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      if (m.userData?.shared) continue;
      for (const k of ['map', 'bumpMap', 'alphaMap', 'emissiveMap', 'normalMap']) if (m[k] && !m[k].userData?.shared) m[k].dispose();
      m.dispose();
    }
  });
}

/** For the graphics diagnostics: how many shared materials and shapes exist, and how often one was asked for. */
export const sharingStats = () => ({ materials: standard.size + glows.size, shapes: shapes.size, asked });
