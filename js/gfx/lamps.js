// What shines after dark outside the yards, for the city's edge (js/gfx/cityedge.js) and the Workers' Park
// (js/park.js): the material of lamps that glow each in their own colour, and pools of light on the ground (with the
// park's spotlight beams) as see-through patches. No real light: js/sky.js turns both up with the night.
import * as THREE from 'three';
import { GLOW, LIGHT, mat } from '../world.js';
import { edge, glowMap } from '../textures.js';

/**
 * A material for joined shapes whose every part glows in its own colour (the colour stored in its corners): dim by day,
 * turned up at night with every other lamp (GLOW).
 * @param byDay  how much of the glow shows by day
 * @param map    the picture on it: the blocks' own, shaded toward their edges
 */
export function shiningMaterial(byDay, map = edge()) {
  const m = mat(0xffffff, { vertexColors: true, map, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: byDay });
  m.userData.byDay = byDay; GLOW.push(m);
  m.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;'); };
  return m;
}

const _c = new THREE.Color();
/**
 * Pools of light on the ground and the beams of spotlights, as one shape: each a see-through patch in its own colour.
 * @param parts  { kind: 'pool', size, color, at: [x, y, z] } a patch lying at y, `size` wide and as deep, or `d` deep (a
 *               long pool before a row of lamps); or { kind: 'beam', w, color, at, to }: narrow and bright at the lamp
 *               (at), wide and faint where it lands (to). Any other kind is laid as a pool (the park's dark patches).
 */
export function lightPatches(parts) {
  const pos = [], uv = [], col = [], index = [];
  for (const p of parts) {
    const k = pos.length / 3, [x, y, z] = p.at;
    if (p.kind !== 'beam') {
      const h = p.size / 2, hz = (p.d ?? p.size) / 2;
      pos.push(x - h, y, z - hz, x - h, y, z + hz, x + h, y, z + hz, x + h, y, z - hz); uv.push(0, 1, 0, 0, 1, 0, 1, 1);
      index.push(k, k + 1, k + 2, k, k + 2, k + 3);
    } else {   // a beam: three points across at each end
      const [bx, by, bz] = p.to, t = 0.16, w = p.w / 2;
      pos.push(x - t, y, z, x, y, z, x + t, y, z, bx - w, by, bz, bx, by, bz, bx + w, by, bz); uv.push(0.22, 0.5, 0.5, 0.5, 0.78, 0.5, 0.08, 0.86, 0.5, 0.86, 0.92, 0.86);
      index.push(k, k + 3, k + 4, k, k + 4, k + 1, k + 1, k + 4, k + 5, k + 1, k + 5, k + 2);
    }
    _c.set(p.color);
    for (let i = pos.length / 3 - k; i > 0; i--) col.push(_c.r, _c.g, _c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(index);
  return geo;
}
/**
 * The material of such patches: nothing by day, faded in with the night by js/sky.js like the pools under the yards' lamps.
 * @param full  how bright at full night  @param side  THREE.DoubleSide for beams, which are seen from either face
 */
export function lightMaterial(full, side = THREE.FrontSide) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, alphaMap: glowMap(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side });
  m.userData.full = full; m.visible = false; LIGHT.push(m);
  return m;
}
