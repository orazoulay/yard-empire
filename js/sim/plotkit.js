// What the two plots of the building site are both written with: the site's own (js/sim/site.js) and the Workers'
// Park's (js/sim/park.js). How much of a build is to be seen, the records their parts are given in with the site's
// colours, the room a footprint leaves a figure, and a repeatable run of numbers. Plain numbers: no drawing here.

/** A repeatable run of numbers in [0, 1) for a whole-number seed (mulberry32). The same seed gives the same world. */
export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * How much of a build is to be seen: -1 nothing (not started), 0 the lot marked out, 1 and up that many finished
 * stages, and all of them for a finished build.
 * @param site  the company's `site`: { done, at, stage }
 */
export function stagesShown(site, build) {
  if (site.done.includes(build.id)) return build.stages.length;
  return site.at === build.id ? site.stage : -1;
}
/** A build that is a park, not a building: it has no floors, walls or lot on the site's plot (its plot is SITE.park). */
export const isPark = build => build.shape.kind === 'park';

/** The records the parts of a build are given in (js/site.js and js/park.js draw them): a block, and a cylinder or cone. */
export const block = (w, h, d, color, x, y, z, more = {}) => ({ kind: 'block', w, h, d, color, at: [x, y, z], ...more });
export const round = (rt, rb, h, color, x, y, z, more = {}) => ({ kind: 'round', rt, rb, h, color, at: [x, y, z], ...more });
export const COLORS = { slab: 0xb9bcc0, earth: 0x8c6f4d, pane: 0x2b3a4a, glass: 0x7fc4e8, lit: 0xffe9a8, wood: 0x8b5a2b, steel: 0x6b7078, peg: 0xf2c230, door: 0x6b4a2f,
  green: 0x6fa84f, bush: 0x4f8f3f, path: 0xd9cfb8, asphalt: 0x5c626b, line: 0xf2f2f2, gold: 0xe3b341, water: 0x6fc3e8, crane: 0xf2a900, brick: 0xb8553a };

export const PAD = 0.3;    // a footprint is this much larger than what is drawn: a figure has a width
