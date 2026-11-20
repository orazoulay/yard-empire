// The quay and the ship of the Port. buildQuay(g) adds the quay to a station's group; buildShip() makes one ship.
//
// The layout, in the quay station's own space: the station stands on the yard's floor at (0, 0), the Port's south fence
// runs at z = 5 (the yard's edge, js/data/areas.js) and the water begins beyond it, at the sea's level (SEA_LEVEL,
// js/world.js). The deck reaches from z = 1 to z = 6, 12 wide (DECK): the footprint nobody walks through
// (js/game/movement.js) is that deck. The fence has an opening where the deck runs through it (js/area.js), and the
// ships lie along the deck's edge (js/ship.js). The camera looks down from +z, so the deck's edge, its fenders and the
// south side of a ship are what it sees; the crane stands at the east end of the deck, clear of the player at its middle,
// its jib along the quay so that it is seen whole, its hook over the water just off the deck in front of the pad.
// Nothing of the quay reaches more than 2 m past the fence (tools/bench/yards-report.mjs holds a station to that).
//
// A ship is built bow to +z, its middle at (0, 0): js/ship.js turns it along the quay or out to sea. Its crates are
// the containers on its deck, shown one after another as its hold fills (js/ship.js); everything else is joined.
//
// Both are built from the parts kit (js/gfx/kit.js) in a few shared surfaces and joined with bake(): a ship is two
// meshes and its lit windows, plus a mesh for each crate shown; the quay is its joined stone and timber (two meshes),
// the stack of containers, the lamps' panes, and the crane's turning top and its hook (two meshes each). The counts are
// pinned in tests/harbour.test.mjs.
import * as THREE from 'three';
import { SEA_LEVEL, QUAY_TOP } from '../world.js';
import { boxShape, shape } from '../engine/materials.js';
import { bake, moving } from '../engine/bake.js';
import { merge, shade } from '../models.js';
import { INK, GEO, block, rod, part, pivot, rig, glowing, hazard, skin } from './kit.js';

/** The quay's deck, in the station's own space: 2 * half wide, from z = from to z = to, its stone at QUAY_TOP. */
export const DECK = { half: 6, from: 1, to: 6, top: QUAY_TOP };
/** A ship: its length along its keel, its beam, and how far its fenders keep it off the quay. */
export const SHIP = { length: 11, beam: 4.2, fender: 0.3 };

const STONE = 0x9e978b, STONE_DARK = 0x857e73, BOARD = 0xa8743f, BOARD_DARK = 0x94642f, CRANE = 0xf2b630;
const GLOW = 0xffd27a, PANE = 0x2c4a66;

// ------------------------------------------------------------------ the quay
/**
 * The quay: a stone pier with a timber deck from the station out over the water, its edge kerbed in yellow and hung with
 * tyres, three bollards, two lamps, a stack of containers at its west end and a crane at its east end.
 * @returns {{ animate(dt: number, working: boolean): void }}  the crane: still at rest; while goods go aboard its jib
 *          slews over the ship and its hook swings
 */
export function buildQuay(g) {
  const q = new THREE.Group(); g.add(q);
  const { half, from, to, top } = DECK, mid = (from + to) / 2, deep = to - from;
  // the pier: stone from the sea bed up to the deck, a rim of stone around the boards
  block(q, half * 2, top - SEA_LEVEL + 0.3, deep, STONE, 0, (top + SEA_LEVEL - 0.3) / 2, mid);
  block(q, half * 2 + 0.04, 0.12, 0.3, STONE_DARK, 0, SEA_LEVEL + 0.1, to - 0.13);          // the tide line along its face
  const boards = 10, bw = (deep - 0.6) / boards;
  for (let i = 0; i < boards; i++) block(q, half * 2 - 0.4, 0.06, bw - 0.05, i % 2 ? BOARD : BOARD_DARK, 0, top + 0.03, from + 0.3 + bw * (i + 0.5));
  // the edge: a yellow kerb with hazard stripes, tyres for fenders on the face, bollards behind the kerb
  block(q, half * 2, 0.16, 0.32, INK.hazard, 0, top + 0.08, to - 0.16);
  hazard(q, half * 2, 0, top + 0.08, to + 0.005, 0.12, 24);
  for (const x of [-4.8, -2.4, 0, 2.4, 4.8]) part(q, GEO.ring(0.24, 0.09, 12), INK.rubber, x, 0, to + 0.1);
  for (const x of [-4.2, -1.4, 1.4]) {
    rod(q, 0.15, 0.36, INK.dark, x, top + 0.18, to - 0.62, 'y', undefined, 10, 0.17);
    rod(q, 0.21, 0.08, INK.dark, x, top + 0.39, to - 0.62, 'y', undefined, 10);
  }
  // a stack of containers at the west end, waiting for a ship: two side by side and one on top, as one shape
  const stack = new THREE.Mesh(merge([...containerParts(0x3b82d6, [-4.95, top + 0.06, 3.1]), ...containerParts(CRATES[0], [-3.75, top + 0.06, 3.1]),
    ...containerParts(CRATES[1], [-4.35, top + 1.03, 3.2])]), skin(0xffffff, { vertexColors: true, map: null }));
  stack.castShadow = true; stack.receiveShadow = true; q.add(stack);
  // two lamps at the landward corners, where they light the deck and the yard in front of it
  const lamps = [];
  for (const s of [-1, 1]) {
    const x = s * (half - 0.35), z = from + 0.35;
    rod(q, 0.07, 2.4, INK.dark, x, top + 1.2, z, 'y', undefined, 8);
    block(q, 0.06, 0.06, 0.55, INK.dark, x, top + 2.38, z + 0.22);
    block(q, 0.16, 0.08, 0.16, INK.dark, x, top + 2.44, z + 0.48);                 // small, so the pane shows around it from above
    block(q, 0.36, 0.05, 0.36, INK.dark, x, top + 2.07, z + 0.48);
    lamps.push({ geo: boxShape(0.32, 0.3, 0.32), at: [x, top + 2.25, z + 0.48] });
  }
  // the crane: a yellow column, a cab and machine house that turn on it, a jib out over the water, and a hook on its line
  const cx = 4.1, cz = 3.9, foot = top + 0.06, H = 2.7;
  block(q, 1.3, 0.22, 1.3, INK.iron, cx, foot + 0.11, cz);
  rod(q, 0.34, H, CRANE, cx, foot + 0.22 + H / 2, cz, 'y', undefined, 12, 0.42);
  rod(q, 0.48, 0.16, INK.dark, cx, foot + 0.22 + H, cz, 'y', undefined, 12);
  const slew = pivot(q, cx, foot + 0.3 + H, cz), REST = -1.15;   // turned along the quay, the hook over the water just off the deck in front of the pad
  slew.rotation.y = REST;
  block(slew, 1.3, 0.9, 1.5, CRANE, 0, 0.45, -0.25, { round: 0.06 });          // the machine house
  block(slew, 1.2, 0.5, 0.6, INK.iron, 0, 0.3, -1.25);                          // its counterweight
  block(slew, 0.8, 0.85, 0.8, CRANE, -0.42, 0.62, 0.55, { round: 0.05 });       // the cab, on the side of the jib
  block(slew, 0.66, 0.36, 0.03, PANE, -0.42, 0.75, 0.96);                        // its window
  const JIB = 5.4, RISE = 0.45, jib = pivot(slew, 0.2, 0.55, 0.35); jib.rotation.x = -RISE;
  for (const s of [-1, 1]) block(jib, 0.08, 0.36, JIB, CRANE, s * 0.2, 0, JIB / 2);   // two chords and the braces between them
  for (let i = 0; i < 6; i++) block(jib, 0.44, 0.06, 0.08, CRANE, 0, (i % 2 ? 0.14 : -0.14), 0.4 + i * (JIB - 0.6) / 5);
  block(jib, 0.48, 0.42, 0.3, INK.dark, 0, 0, JIB);                              // the sheave at its tip
  const tip = new THREE.Vector3(0.2, 0.55 + Math.sin(RISE) * JIB, 0.35 + Math.cos(RISE) * JIB);
  pipeLine(slew, [0, 1.55, -0.6], [tip.x, tip.y + 0.15, tip.z]);                // the luffing stay from the house to the tip
  block(slew, 0.3, 0.7, 0.3, CRANE, 0, 1.2, -0.6);
  const hook = pivot(slew, tip.x, tip.y - 0.2, tip.z), LINE = 3.2;
  rod(hook, 0.018, LINE, INK.dark, 0, -LINE / 2, 0, 'y', undefined, 5);
  block(hook, 0.3, 0.26, 0.22, INK.hazard, 0, -LINE - 0.1, 0, { round: 0.04 });
  hazard(hook, 0.3, 0, -LINE - 0.1, 0.115, 0.1, 4);
  part(hook, GEO.ring(0.1, 0.035, 10), INK.steel, 0, -LINE - 0.33, 0);
  rig(hook); rig(slew);
  // the lamps' panes are one mesh that glows after dark; the rest of the quay is joined
  glowing(q, lamps, 0xfff1c2, GLOW, 0.06).castShadow = false;
  moving(slew); bake(q);

  let phase = 0, swing = 0;
  return {
    animate(dt, working) {
      swing += ((working ? 1 : 0) - swing) * Math.min(1, dt * 1.5);   // eases in when goods go aboard, and settles after
      if (swing < 0.001) { swing = 0; return; }
      phase += dt;
      slew.rotation.y = REST + Math.sin(phase * 0.7) * 0.35 * swing;
      hook.rotation.x = Math.sin(phase * 2.3) * 0.16 * swing;
      hook.rotation.z = Math.sin(phase * 1.7 + 1) * 0.1 * swing;
    },
  };
}
/** A thin straight line of steel between two points, under `p`. */
function pipeLine(p, a, b) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const m = rod(p, 0.025, len, INK.dark, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, 'y', undefined, 5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

// ------------------------------------------------------------------ containers
/** The three colours of the containers a ship carries. */
export const CRATES = [0xef7f2a, 0x3f9e5a, 0xd2443a];
const CW = 1.12, CH = 0.95, CL = 2.7;   // a container: across, high, along
/** The parts of a container in one colour, its foot at `o`, for merge(): ribbed sides, a darker door end, lines across its roof. */
function containerParts(color, [ox, oy, oz] = [0, 0, 0]) {
  const rib = shade(color, 0.78), parts = [], add = (geo, c, x, y, z) => parts.push({ geo, color: c, at: [ox + x, oy + y, oz + z] });
  add(boxShape(CW, CH, CL), color, 0, CH / 2, 0);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) add(boxShape(0.04, CH - 0.12, 0.08), rib, s * (CW / 2 + 0.01), CH / 2, -CL / 2 + 0.3 + i * (CL - 0.6) / 6);
  for (let i = 0; i < 5; i++) add(boxShape(CW - 0.12, 0.03, 0.07), rib, 0, CH + 0.01, -CL / 2 + 0.35 + i * (CL - 0.7) / 4);
  add(boxShape(CW - 0.1, CH - 0.1, 0.04), rib, 0, CH / 2, CL / 2 + 0.01);
  for (const s of [-1, 1]) add(boxShape(0.05, CH - 0.2, 0.05), INK.dark, s * 0.2, CH / 2, CL / 2 + 0.04);
  return parts;
}
/** A container in one colour as one shape, made once. */
const containerShape = color => shape(`harbour-container|${color}`, () => merge(containerParts(color)));
/** One container mesh under `p`, its foot at (x, y, z). */
function container(p, color, x, y, z) {
  const m = new THREE.Mesh(containerShape(color), skin(0xffffff, { vertexColors: true, map: null }));
  m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, y, z); p.add(m);
  return m;
}

// ------------------------------------------------------------------ the ship
/** The outline of the hull seen from above, `inset` inside its side, as points (x, z) from the stern round the bow. */
function outline(inset = 0) {
  const w = SHIP.beam / 2 - inset, back = -SHIP.length / 2 + inset, front = SHIP.length / 2 - inset, r = 0.55, pts = [];
  const shoulder = 2.2;   // where the sides begin to close in toward the bow
  for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + i / 3 * Math.PI / 2; pts.push([w - r + Math.cos(a) * r, back + r + Math.sin(a) * r]); }
  for (let i = 1; i <= 8; i++) { const t = i / 8; pts.push([w * (1 - Math.pow(t, 2.2)), shoulder + t * (front - shoulder)]); }
  const right = pts.slice(0, -1).map(([x, z]) => [-x, z]).reverse();   // the other side, mirrored, back to the stern
  return [...pts, ...right];
}
/** A flat shape of the hull for ExtrudeGeometry, from points (x, z); turned so that it is extruded upward. */
const toShape = pts => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
/** The hull between y0 and y1, `inset` inside its side; with `hole`, a rim that far inside it. */
const hullShape = (inset, y0, y1, hole = 0) => shape(`harbour-hull|${inset}|${y0}|${y1}|${hole}`, () => {
  const s = toShape(outline(inset));
  if (hole) s.holes.push(new THREE.Path(outline(inset + hole).map(([x, z]) => new THREE.Vector2(x, -z))));
  return new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
});

const NAVY = 0x23486f, RED = 0xc63d2f, WHITE = 0xf2efe6, DECKC = 0x6d8475, FUNNEL = 0xe0452f;
/** Where a ship's containers stand, in the order its hold fills them: across, along, then up. */
export function crateSpots() {
  const out = [], D = SEA_LEVEL + 1.35 + 0.16;
  for (let tier = 0; tier < 2; tier++) for (const z of [-0.95, 1.85]) for (const x of [-1.2, 0, 1.2]) out.push([x, D + tier * (CH + 0.02), z]);
  return out;
}

/**
 * A cargo ship, about 11 by 4.2: a navy hull over a red bottom with a white rim, a green deck, the bridge at the stern
 * with its windows, funnel and lifeboats, a mast at the bow, and twelve containers in three colours that start hidden.
 * @returns {{ g: THREE.Group, crates: THREE.Mesh[] }}
 */
export function buildShip() {
  const g = new THREE.Group(), W = SEA_LEVEL, D = W + 1.35;   // W: the waterline, D: the main deck
  part(g, hullShape(0.05, W - 0.35, W + 0.14), RED, 0, 0, 0);
  part(g, hullShape(0, W + 0.14, D), NAVY, 0, 0, 0);
  part(g, hullShape(0, D, D + 0.16, 0.16), WHITE, 0, 0, 0);
  part(g, hullShape(0.16, D, D + 0.04), DECKC, 0, 0, 0);
  block(g, 3.75, 0.12, 5.9, INK.iron, 0, D + 0.1, 0.45);                              // the hatch the containers stand on
  // the house at the stern: two decks and the bridge on top, its wings out to the sides, the funnel behind it
  block(g, 3.5, 1.4, 2.2, WHITE, 0, D + 0.7, -4.2, { round: 0.05 });
  block(g, 3.1, 0.7, 1.9, WHITE, 0, D + 1.75, -4.15, { round: 0.05 });
  block(g, 2.7, 0.6, 0.85, WHITE, 0, D + 2.4, -3.62, { round: 0.04 });
  block(g, 4.1, 0.08, 0.55, WHITE, 0, D + 2.14, -3.45);
  block(g, 2.9, 0.08, 1.0, 0xc9ced4, 0, D + 2.74, -3.62);
  rod(g, 0.035, 0.7, INK.dark, 0, D + 3.1, -3.75, 'y', undefined, 5);
  block(g, 0.7, 0.05, 0.08, INK.dark, 0, D + 3.4, -3.75);                            // the radar's bar
  block(g, 0.9, 1.25, 0.85, FUNNEL, 0, D + 2.72, -4.75, { round: 0.1 });
  block(g, 0.94, 0.16, 0.89, WHITE, 0, D + 2.95, -4.75);
  block(g, 0.94, 0.14, 0.89, INK.dark, 0, D + 3.3, -4.75);
  for (const s of [-1, 1]) block(g, 0.42, 0.3, 1.2, 0xff8a1f, s * 1.86, D + 1.6, -4.25, { round: 0.12 });   // the lifeboats, orange on their davits
  // the bow: a mast with its light, a winch, bollards fore and aft
  rod(g, 0.07, 2.3, WHITE, 0, D + 1.15, 4.3, 'y', undefined, 8);
  block(g, 1.3, 0.07, 0.07, WHITE, 0, D + 1.85, 4.3);
  block(g, 0.9, 0.35, 0.5, INK.iron, 0, D + 0.18, 3.6, { round: 0.04 });
  for (const [x, z] of [[-1.2, 4.0], [1.2, 4.0], [-1.4, -5.0], [1.4, -5.0]]) rod(g, 0.09, 0.25, INK.dark, x, D + 0.13, z, 'y', undefined, 8);
  // the windows: a band across the bridge, rows of them on the decks below, the mast's light; one mesh that glows after dark
  const win = [], pane = (w, h, at, turn = [0, 0, 0]) => win.push({ geo: boxShape(w, h, 0.03), at, turn, color: PANE });
  pane(2.4, 0.26, [0, D + 2.48, -3.18]);
  for (const s of [-1, 1]) { pane(0.75, 0.36, [s * 1.36, D + 2.44, -3.62], [0, Math.PI / 2, 0]); pane(1.6, 0.32, [s * 1.56, D + 1.78, -4.15], [0, Math.PI / 2, 0]); }
  for (const y of [D + 0.45, D + 1.0]) {
    for (const x of [-1.15, -0.4, 0.4, 1.15]) pane(0.42, 0.3, [x, y, -3.08]);
    for (const s of [-1, 1]) for (const z of [-4.85, -4.2, -3.55]) pane(0.56, 0.34, [s * 1.76, y, z], [0, Math.PI / 2, 0]);
  }
  pane(1.6, 0.2, [0, D + 1.78, -3.19]);
  win.push({ geo: boxShape(0.16, 0.16, 0.16), at: [0, D + 2.38, 4.3], color: 0xfff1c2 });
  glowing(g, win, 0xffffff, GLOW, 0.05).castShadow = false;
  // the containers, each a mesh of its own: shown as the hold fills
  const crates = crateSpots().map(([x, y, z], i) => {
    const c = container(g, CRATES[(i + Math.floor(i / 3)) % 3], x, y, z);
    c.visible = false;
    return moving(c);
  });
  bake(g);
  return { g, crates };
}
