// The decorations of the credits store: a fountain, a statue or a row of flags, one to a yard, at the spot
// js/sim/decor.js gives it. Each is built in its own space, like a thing of the yards' dressing: x along the fence (the
// middle of its length at 0), y up, z into the yard from its back at 0. It stays inside 1.2 by 1.2 on the ground and
// under 2.5 tall (DECOR in js/sim/decor.js): slender, so that it fits the free ground of every yard, and tall, so that
// it is seen from the game's camera. Where it must stay low the yard builds it smaller. Its still parts are joined (js/engine/bake.js): two or three draws, and what was joined is freed
// when the decoration is changed or taken away (js/engine/materials.js, release).
import * as THREE from 'three';
import { box, cyl } from '../world.js';
import { bake } from '../engine/bake.js';

const STONE = 0xb9bbb6, PALE = 0xd6d8d2, IRON = 0x3a3f46, GOLD = 0xffc933, WATER = 0x4fb8e6;
/**
 * A part at its place. Every part is of the one plain surface and throws no shadow, so that all the decorations of a
 * yard are joined into a single mesh: one draw for a yard in sight, and none in the shadow pass.
 */
const put = (g, mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = false; g.add(mesh); return mesh; };

const MODELS = {
  /** A stone basin with a bowl on a column, water in both, a jet that rises from the bowl and four streams that fall from it. */
  fountain(g) {
    put(g, cyl(0.58, 0.6, 0.4, STONE, 16), 0, 0.2, 0.6);
    put(g, cyl(0.6, 0.6, 0.06, PALE, 16), 0, 0.41, 0.6);
    put(g, cyl(0.5, 0.5, 0.03, WATER, 16), 0, 0.445, 0.6);
    put(g, cyl(0.1, 0.15, 1.0, STONE, 8), 0, 0.94, 0.6);
    put(g, cyl(0.36, 0.14, 0.18, PALE, 12), 0, 1.5, 0.6);
    put(g, cyl(0.31, 0.31, 0.03, WATER, 12), 0, 1.6, 0.6);
    put(g, cyl(0.03, 0.09, 0.62, 0xdff4ff, 6), 0, 1.92, 0.6);          // the jet
    put(g, cyl(0.16, 0.05, 0.14, 0xf2fbff, 8), 0, 2.3, 0.6);           // and where it breaks at the top
    for (const [x, z] of [[0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]]) put(g, cyl(0.035, 0.035, 1.14, 0xbfe6ff, 5), x, 1.02, 0.6 + z);
  },
  /** A golden worker on a tall stone plinth, one arm raised with a coin. */
  statue(g) {
    put(g, box(1.0, 0.14, 1.0, STONE, { round: 0.03 }), 0, 0.07, 0.6);
    put(g, box(0.78, 0.9, 0.78, PALE, { round: 0.04 }), 0, 0.59, 0.6);
    put(g, box(0.88, 0.1, 0.88, STONE, { round: 0.03 }), 0, 1.09, 0.6);
    put(g, box(0.4, 0.36, 0.26, GOLD, { round: 0.05 }), 0, 1.32, 0.6);    // the legs
    put(g, box(0.48, 0.44, 0.3, GOLD, { round: 0.07 }), 0, 1.7, 0.6);     // the body
    put(g, box(0.32, 0.3, 0.32, GOLD, { round: 0.08 }), 0, 2.06, 0.6);    // the head
    put(g, box(0.4, 0.1, 0.4, GOLD, { round: 0.04 }), 0, 2.25, 0.6);      // its helmet
    put(g, box(0.13, 0.36, 0.13, GOLD, { round: 0.04 }), -0.31, 1.68, 0.6);
    put(g, box(0.13, 0.42, 0.13, GOLD, { round: 0.04 }), 0.36, 1.98, 0.6).rotation.z = -0.5;   // the arm that is raised
    put(g, box(0.26, 0.26, 0.05, 0xffe27a, { round: 0.02 }), 0.46, 2.28, 0.6);                     // and the coin in its hand
  },
  /** Three flags on poles in a stone foot: red, yellow and blue, each flying east of its pole and clear of the next. */
  flags(g) {
    put(g, box(1.18, 0.14, 0.46, STONE, { round: 0.03 }), 0, 0.07, 0.32);
    [0xd63a2f, GOLD, 0x2f6fd6].forEach((colour, i) => {
      const x = -0.53 + i * 0.38, top = 2.05 + (i === 1 ? 0.2 : 0);   // the middle one a little taller
      put(g, box(0.06, top, 0.06, IRON), x, top / 2 + 0.1, 0.32);
      put(g, box(0.11, 0.07, 0.11, 0xd9b23c), x, top + 0.13, 0.32);
      put(g, box(0.31, 0.22, 0.03, colour), x + 0.03 + 0.155, top - 0.06, 0.32 + (i - 1) * 0.05).rotation.y = (i - 1) * 0.18;
    });
  },
};
/** The decorations there are (js/data/looks.js, STORE_LOOKS.decor). */
export const DECORS = Object.keys(MODELS);

/**
 * The decoration of one yard: one of it at every spot of the yard (js/sim/decor.js: [{ x, z, turn, scale }]), all joined
 * into one mesh for the whole yard. null for a kind there is not, or for a yard without a spot.
 */
export function buildDecor(kind, spots) {
  if (!MODELS[kind] || !spots?.length) return null;
  const root = new THREE.Group(); root.name = 'decor:' + kind;
  for (const at of spots) {
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z); g.rotation.y = at.turn; g.scale.setScalar(at.scale ?? 1);   // smaller where it has to stay low
    MODELS[kind](g);
    root.add(g);
  }
  bake(root);
  return root;
}
