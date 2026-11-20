// Where the two things of the credits store that stand in a yard go, as plain numbers: the flag with the company's
// emblem, and the decoration (a fountain, a statue or flags). No drawing here: js/area.js builds them, and
// tests/credits-looks-spots.test.mjs checks all 24 yards without a screen.
//
// Neither may be in anybody's way, and neither has a body of its own, so they follow the rules of the yards' dressing
// (js/sim/dressing.js) and stand where that leaves room:
//   - the flag flies from a lamp post of the yard, which is there already and kept clear of everything: the post
//     furthest to the back that the yard has, so that it is seen over the yard and hides nothing of it;
//   - a decoration stands in the strip along a fence, on ground that is free of the gates, the lamps, the machines
//     with the room around them, the shops, the piles, the plots, where trucks stop and every thing of the dressing:
//     as far to the back as there is such ground. It is as tall as the dressing's own things may be where it stands
//     (tall at the back, low on the camera's side), so in a yard whose only free ground lies along the south fence it
//     is built smaller, and hides nothing of the yard. A yard always leaves room for one: where its things would
//     leave no free ground anywhere, its small things give way (js/sim/dressing.js, yardDressing).
// A yard is the same on every device: nothing here is drawn by chance.
import { AREAS } from '../data/areas.js';
import { SITE } from '../data/builds.js';
import { DECOR, decorGround, fencedSides, lampPlan, yardDressing, yardKeepouts } from './dressing.js';

/** The ground a decoration takes at its full size (along the fence, into the yard) and how tall it then is: kept in
 *  js/sim/dressing.js, whose dressing leaves room for one. */
export { DECOR };
/** A yard has up to this many decorations, and two of them stand at least this far apart. */
export const SPOTS = 2, APART = 6;
const GATE = 2.2;   // half the width of a gate (GATE_HALF in js/area.js)
const POST = 0.32;  // how far inside the fence line a lamp post stands (LAMP.inset in js/scenery.js)

/** The lamp posts of a yard, as js/area.js stands them: [{ side, x, z, nx, nz, at }]. */
function lampsOf(cfg, areas) {
  const way = SITE.gate.yard === cfg.id ? SITE.gate : null;
  return lampPlan(cfg.bounds, fencedSides(cfg, areas), [cfg.gate, way].filter(Boolean), GATE + 2.4);
}

/**
 * The lamp post the company's flag flies from: { x, z, side, away }, where the post stands and whether the cloth
 * flies toward the west (a post on the east fence: the cloth stays over its own yard), or null for a yard without a
 * lamp (there is none today). The post furthest to the back; of two as
 * far back, the one nearer the middle of the yard from west to east.
 */
export function flagSpot(cfg, areas = AREAS) {
  const b = cfg.bounds, mid = (b.minX + b.maxX) / 2;
  const posts = lampsOf(cfg, areas).slice().sort((p, q) => p.z - q.z || Math.abs(p.x - mid) - Math.abs(q.x - mid) || p.x - q.x);
  const p = posts[0];
  return p ? { x: p.x + p.nx * POST, z: p.z + p.nz * POST, side: p.side, away: p.side === 'e' } : null;
}

/**
 * Where the yard's decorations stand: [{ x, z, turn, side, rect, scale }], for each the middle of its back on the
 * fence's side, the turn that faces it into the yard, the ground it stands on at its full size, and how large it is
 * built there (1, or less where it has to stay low). The best spot first; a second one where the yard has free ground
 * far enough from the first. Empty only when a yard has no free ground even where its small things gave way (none has).
 */
export function decorSpots(cfg, areas = AREAS) {
  const free = decorGround(cfg, yardKeepouts(cfg, { areas }), yardDressing(cfg, { areas }).props);
  const out = [];
  for (const p of free) if (out.length < SPOTS && out.every(o => Math.hypot(o.x - p.x, o.z - p.z) >= APART)) out.push(p);
  return out;
}
