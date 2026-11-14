// Product models: what every good looks like in a hand, on a pallet, on a shop counter and on a machine's sign.
//
// Every product is ONE shape with ONE material (a list of materials only where the shape has groups, like a log's bark
// and cut ends), so that a whole stack of it can be drawn in one go (js/items3d.js, Stack). Products made of several
// parts are joined into one shape with each part's colour kept in it (merge() in js/models.js), and drawn with a
// white material that shows those colours.
//
// The size of every product is the size the data file gives its `mesh` (js/data/areas.js): stacks are as tall as the
// data says (stackStep and stackBase in js/items3d.js read the same numbers), whatever the model looks like.
import * as THREE from 'three';
import { ITEMS } from '../data/areas.js';
import { bark, rings, wood } from '../textures.js';
import { roundedBox } from '../world.js';
import { blockPart, merge, roundPart, shade } from '../models.js';

// What a product is made of (the `finish` of its mesh in the data file) decides how it takes the light.
const FINISH = {
  wood: () => wood(),
  metal: () => ({ metalness: 0.8, roughness: 0.34, envMapIntensity: 0.8 }),
  gold: () => ({ metalness: 0.7, roughness: 0.3, envMapIntensity: 0.9 }),   // fully metallic gold mirrors the green ground and turns olive
  glass: () => ({ roughness: 0.05, metalness: 0.2, envMapIntensity: 1 }),
  gem: () => ({ roughness: 0.08, metalness: 0.25, envMapIntensity: 1.1 }),
  barrel: () => ({ metalness: 0.6, roughness: 0.4, envMapIntensity: 0.7 }),
  plastic: () => ({ roughness: 0.35 }),
  stone: () => ({ roughness: 0.96 }),
};
export const surface = (color, { opacity, finish } = {}, extra = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.8, metalness: 0, envMapIntensity: 0.42, ...(FINISH[finish]?.() || {}),
  ...(opacity != null && opacity < 1 ? { transparent: true, opacity } : {}), ...extra,
});

const rounded = (w, h, d, r, color, at, turn) => ({ geo: roundedBox(w, h, d, r, 1), color, at, turn });
const lying = [Math.PI / 2, 0, 0];   // a cylinder turned to lie along z

/**
 * Products built from parts. Each takes the item's mesh spec from the data file and returns one geometry with vertex
 * colours. A box-shaped spec is centred on its middle; everything else stands on the ground (y = 0 at its foot).
 */
export const MODELS = {
  /** A loaf: rounded all over, with three cuts across the crust. */
  bread: ({ color }) => merge([
    { geo: new THREE.CapsuleGeometry(0.13, 0.3, 3, 8).rotateZ(Math.PI / 2), color, scale: [1, 0.9, 1.12] },
    ...[-0.13, 0, 0.13].map(x => blockPart(0.03, 0.02, 0.2, 0xf6dfae, [x, 0.112, 0], [0, 0.5, 0])),
  ]),
  /** A sack lying flat: soft edges, the tied end sticking out, a stamp on top. */
  flour: ({ color }) => merge([
    rounded(0.46, 0.3, 0.36, 0.11, color),
    blockPart(0.08, 0.1, 0.16, shade(color, 0.86), [0.25, 0.04, 0]),
    blockPart(0.18, 0.012, 0.16, 0xc0392b, [-0.03, 0.151, 0]),
  ]),
  /** A drum: three rolled rims, a sunk lid and a bung. Crude oil and fuel differ in colour only. */
  crude: spec => drum(spec),
  fuel: spec => drum(spec),
  /** A pane lying flat: the sheet, and around it the darker cut edge that makes glass look like glass. */
  glass: ({ color }) => merge([
    blockPart(0.64, 0.04, 0.64, color),
    ...[-0.335, 0.335].map(z => blockPart(0.7, 0.07, 0.03, 0x4fb6d6, [0, 0, z])),
    ...[-0.335, 0.335].map(x => blockPart(0.03, 0.07, 0.64, 0x4fb6d6, [x, 0, 0])),
  ]),
  /** A chair standing on its four legs. */
  chair: ({ color }) => merge([
    blockPart(0.5, 0.07, 0.5, color, [0, 0.3, 0]),
    blockPart(0.5, 0.45, 0.07, color, [0, 0.55, -0.22]),
    ...[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z]) => blockPart(0.06, 0.3, 0.06, shade(color, 0.85), [x, 0.15, z])),
  ]),
  /** A hammer lying on its side: a wooden handle and a steel head. */
  tool: ({ color }) => merge([
    blockPart(0.7, 0.08, 0.08, 0x9c6b3c, [0, 0.1, 0]),
    blockPart(0.16, 0.2, 0.3, color, [0.3, 0.1, 0]),
  ]),
  /** An engine: block, sump, a red valve cover, the flywheel at one end and a manifold along the side. */
  engine: ({ color }) => merge([
    blockPart(0.24, 0.05, 0.3, 0x3a424c, [0, 0.025, 0]),
    blockPart(0.3, 0.16, 0.34, color, [0, 0.13, 0]),
    blockPart(0.26, 0.06, 0.3, shade(color, 1.18), [0, 0.24, 0]),
    blockPart(0.14, 0.05, 0.3, 0xd63a2f, [-0.02, 0.295, 0]),
    roundPart(0.115, 0.115, 0.04, 0x2b3037, [0, 0.13, 0.19], lying, 12),
    roundPart(0.05, 0.05, 0.035, 0x2b3037, [0, 0.13, -0.187], lying, 8),
    blockPart(0.05, 0.05, 0.28, 0x6a7078, [0.175, 0.19, 0]),
  ]),
  /** A car: body, a dark glass cabin with a painted roof, four wheels and lights. */
  car: ({ color }) => merge([
    rounded(0.8, 0.13, 0.38, 0.045, color, [0, -0.025, 0]),
    rounded(0.4, 0.085, 0.33, 0.035, 0x22303c, [-0.04, 0.078, 0]),
    blockPart(0.32, 0.012, 0.29, color, [-0.04, 0.123, 0]),
    ...[[0.25, 0.185], [0.25, -0.185], [-0.25, 0.185], [-0.25, -0.185]].map(([x, z]) => roundPart(0.06, 0.06, 0.05, 0x1d1f22, [x, -0.07, z], lying, 8)),
    blockPart(0.02, 0.035, 0.3, 0xfff3b0, [0.398, -0.015, 0]),
    blockPart(0.02, 0.03, 0.3, 0x9c1f1f, [-0.398, -0.015, 0]),
  ]),
  /** A robot: a head with a visor and two eyes, a body with a chest light, arms, a base and an aerial. */
  robot: ({ color }) => merge([
    blockPart(0.26, 0.07, 0.26, 0x3a424c, [0, -0.205, 0]),
    rounded(0.26, 0.2, 0.2, 0.045, color, [0, -0.07, 0]),
    blockPart(0.08, 0.05, 0.012, 0x3aa0ff, [0, -0.05, 0.1]),
    rounded(0.2, 0.14, 0.18, 0.04, color, [0, 0.11, 0]),
    blockPart(0.15, 0.05, 0.012, 0x1b2733, [0, 0.12, 0.09]),
    ...[-0.04, 0.04].map(x => blockPart(0.03, 0.025, 0.014, 0x5ff0ff, [x, 0.12, 0.093])),
    ...[-0.155, 0.155].map(x => blockPart(0.05, 0.18, 0.07, shade(color, 0.8), [x, -0.07, 0])),
    roundPart(0.008, 0.008, 0.05, 0x3a424c, [0.05, 0.203, 0], [0, 0, 0], 5),
    blockPart(0.024, 0.024, 0.024, 0xff5a52, [0.05, 0.228, 0]),
  ]),
  /** An iron ingot: a cast block wider at its foot, its top edge chamfered, a maker's stamp on top. */
  bar: ({ color }) => merge([
    { geo: frustum(0.58, 0.26, 0.5, 0.19, 0.13, -0.08), color },
    { geo: frustum(0.5, 0.19, 0.44, 0.13, 0.028, 0.05), color: shade(color, 1.12) },
    blockPart(0.16, 0.002, 0.06, shade(color, 0.7), [0, 0.079, 0]),
  ]),
  /** A gold bar: the same cast shape, a deep stamp on top with the assay mark in it. */
  gold: ({ color }) => merge([
    { geo: frustum(0.58, 0.28, 0.48, 0.2, 0.15, -0.09), color },
    { geo: frustum(0.48, 0.2, 0.42, 0.15, 0.026, 0.06), color: shade(color, 1.08) },
    blockPart(0.28, 0.0025, 0.1, shade(color, 0.72), [0, 0.08725, 0]),
    ...[-0.07, 0, 0.07].map(x => blockPart(0.04, 0.0015, 0.05, shade(color, 1.15), [x, 0.08925, 0])),
  ]),
  /** A steel I-beam lying along its length, a yellow mill mark near one end. */
  steel: ({ color }) => merge([
    blockPart(0.62, 0.034, 0.3, color, [0, 0.081, 0]),
    blockPart(0.62, 0.036, 0.3, color, [0, -0.082, 0]),
    blockPart(0.62, 0.13, 0.07, shade(color, 0.85), [0, 0, 0]),
    blockPart(0.04, 0.002, 0.3, 0xf2b630, [0.24, 0.099, 0]),
  ]),
  /** A brick with three holes through it. */
  brick: ({ color }) => merge([
    blockPart(0.6, 0.214, 0.3, color, [0, -0.003, 0]),
    ...[-0.17, 0, 0.17].map(x => roundPart(0.045, 0.045, 0.006, shade(color, 0.45), [x, 0.107, 0], [0, 0, 0], 8)),
  ]),
  /** A circuit board: green board, a big chip and two small ones, capacitors, traces and a gold edge connector. */
  circuit: ({ color }) => merge([
    blockPart(0.6, 0.03, 0.44, color, [0, -0.02, 0]),
    blockPart(0.5, 0.006, 0.05, 0xe8c66a, [0, -0.002, 0.19]),
    ...[-0.13, -0.03, 0.07, 0.17].map(z => blockPart(0.44, 0.003, 0.012, shade(color, 1.45), [0.02, -0.0035, z - 0.04])),
    blockPart(0.17, 0.03, 0.17, 0x1d1f23, [-0.1, 0.01, -0.04]),
    blockPart(0.09, 0.022, 0.12, 0x2b3037, [0.12, 0.006, -0.08]),
    blockPart(0.09, 0.022, 0.07, 0x2b3037, [0.2, 0.006, 0.07]),
    ...[[0.06, 0.08], [-0.22, 0.1]].map(([x, z]) => roundPart(0.025, 0.025, 0.05, 0x3a6fd8, [x, 0.01, z], [0, 0, 0], 8)),
  ]),
  /** A power cell: a dark casing with a band in its colour, a steel cap and the terminal. */
  cell: ({ r, h, color }) => merge([
    roundPart(r - 0.008, r - 0.008, h - 0.06, 0x2b3037, [0, (h - 0.06) / 2, 0], [0, 0, 0], 12),
    roundPart(r, r, h * 0.44, color, [0, h * 0.42, 0], [0, 0, 0], 12),
    roundPart(r * 0.9, r - 0.008, 0.03, 0xc9cfd5, [0, h - 0.045, 0], [0, 0, 0], 12),
    roundPart(r * 0.35, r * 0.35, 0.03, 0xc9cfd5, [0, h - 0.015, 0], [0, 0, 0], 8),
    blockPart(0.03, h * 0.3, 0.012, 0xffffff, [0, h * 0.42, r - 0.006]),
  ]),
  /** A moulded canister: rounded body, a handle on top, a capped spout and a white label. */
  plastic: ({ color }) => merge([
    rounded(0.45, 0.27, 0.33, 0.05, color, [0, -0.035, 0]),
    ...[-0.11, 0.07].map(x => blockPart(0.04, 0.05, 0.06, shade(color, 0.9), [x, 0.12, 0])),
    blockPart(0.24, 0.035, 0.06, shade(color, 0.9), [-0.02, 0.15, 0]),
    roundPart(0.04, 0.045, 0.05, shade(color, 0.9), [0.17, 0.125, 0], [0, 0, 0], 8),
    roundPart(0.048, 0.048, 0.02, 0xffffff, [0.17, 0.16, 0], [0, 0, 0], 8),
    blockPart(0.22, 0.12, 0.004, 0xffffff, [-0.02, -0.04, 0.168]),
  ]),
  /** A gift box: box and lid, a ribbon both ways round, and a bow on top. */
  giftset: ({ color }) => merge([
    blockPart(0.42, 0.21, 0.42, color, [0, -0.055, 0]),
    blockPart(0.44, 0.04, 0.44, shade(color, 1.15), [0, 0.07, 0]),
    blockPart(0.43, 0.252, 0.07, 0xffd23f, [0, -0.034, 0]),
    blockPart(0.07, 0.252, 0.43, 0xffd23f, [0, -0.034, 0]),
    ...[-1, 1].map(s => blockPart(0.12, 0.035, 0.06, 0xffd23f, [s * 0.055, 0.118, 0], [0, 0, s * 0.45])),
    blockPart(0.05, 0.05, 0.05, shade(0xffd23f, 0.85), [0, 0.11, 0]),
  ]),
  /** A cut gem: a pointed pavilion under a flat-topped crown. */
  gem: ({ r, color }) => merge([
    { geo: new THREE.ConeGeometry(r, r * 1.1, 8).rotateX(Math.PI).translate(0, r * 0.55, 0), color },
    { geo: new THREE.CylinderGeometry(r * 0.6, r, r * 0.55, 8).translate(0, r * 1.1 + r * 0.275, 0), color: shade(color, 1.12) },
  ]),
};
/** Faceted products whose faces show (flat shading). */
const FLAT = new Set(['gem']);
/** A block narrower at the top than at its foot (a cast ingot), its foot at y0, with a face normal on every face. */
function frustum(bw, bd, tw, td, h, y0) {
  const B = [[-bw / 2, y0, -bd / 2], [bw / 2, y0, -bd / 2], [bw / 2, y0, bd / 2], [-bw / 2, y0, bd / 2]];
  const T = [[-tw / 2, y0 + h, -td / 2], [tw / 2, y0 + h, -td / 2], [tw / 2, y0 + h, td / 2], [-tw / 2, y0 + h, td / 2]];
  const quads = [[T[0], T[3], T[2], T[1]], [B[0], B[1], B[2], B[3]]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quads.push([B[i], T[i], T[j], B[j]]); }
  const pos = [];
  for (const [a, b, c, d] of quads) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
function drum({ r, h, color }) {
  const rim = shade(color, 0.72), R = r - 0.012;
  return merge([
    roundPart(R, R, h, color, [0, h / 2, 0], [0, 0, 0], 12),
    ...[0.018, h / 2, h - 0.018].map(y => roundPart(r, r, 0.036, rim, [0, y, 0], [0, 0, 0], 12)),
    roundPart(R - 0.035, R - 0.035, 0.012, shade(color, 0.86), [0, h + 0.003, 0], [0, 0, 0], 12),
    roundPart(0.035, 0.035, 0.016, rim, [r * 0.45, h + 0.012, 0], [0, 0, 0], 6),
  ]);
}

/** Shapes in the data file that have a model of their own whatever the product is called. */
const BY_SHAPE = { hammer: 'tool', chair: 'chair' };
const shapes = new Map();   // item type -> { geo, mat }
/**
 * The one shape and material of a product, made once and shared by every copy of it in the game.
 * @returns { geo, mat }  mat is a material, or a list of them for a shape with groups
 */
export function productShape(type) {
  if (shapes.has(type)) return shapes.get(type);
  const spec = ITEMS[type]?.mesh || { shape: 'box', size: [0.5, 0.2, 0.3], color: 0xffffff };
  let p;
  const model = MODELS[type] || MODELS[BY_SHAPE[spec.shape]];
  if (model) {
    p = { geo: model(spec), mat: surface(0xffffff, spec, { vertexColors: true, ...(FLAT.has(type) ? { flatShading: true } : {}) }) };   // the colours are in the shape itself
  } else if (spec.shape === 'log') {
    // a log is bark around and cut wood at both ends: one material for the side, one for the two caps
    const side = surface(spec.color, {}, bark()), end = surface(0xffffff, {}, rings());
    p = { geo: new THREE.CylinderGeometry(0.17, 0.17, 1.1, 10).rotateZ(Math.PI / 2), mat: [side, end, end] };
  } else {
    let geo, flat = false;
    switch (spec.shape) {
      case 'cyl':   geo = new THREE.CylinderGeometry(spec.r, spec.r, spec.h, 12).translate(0, spec.h / 2, 0); break;
      case 'rock':  geo = new THREE.DodecahedronGeometry(spec.r, 0).scale(1, 0.75, 1).translate(0, spec.r * 0.6, 0); flat = true; break;
      case 'gem':   geo = new THREE.OctahedronGeometry(spec.r, 0).translate(0, spec.r, 0); flat = true; break;
      case 'torus': geo = new THREE.TorusGeometry(spec.r, spec.r * 0.32, 6, 16).rotateX(Math.PI / 2).translate(0, spec.r * 0.32, 0); break;
      default:      geo = new THREE.BoxGeometry(...(spec.size || [0.5, 0.2, 0.3]));
    }
    p = { geo, mat: surface(spec.color, spec, flat ? { flatShading: true } : {}) };
  }
  p.geo.userData.shared = true;
  [].concat(p.mat).forEach((m, i) => { m.userData.shared = true; m.userData.key = `product=${type}|${i}|color=${m.color.getHex()}`; });
  shapes.set(type, p);
  return p;
}
