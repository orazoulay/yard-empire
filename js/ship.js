// The ships of the Port, made visible. Where a ship is comes from the rules alone (Company.port): at the quay, or at a
// point of its voyage worked out from the time it has been away and the time it has left. Nothing is kept here but the
// models.
//
// At the quay a ship lies along the edge of the deck, bow to the west, in the water south of the Port's fence; two lie
// end to end, BERTH apart, along the Port's wall. It leaves bow first: pushed off the quay to its lane, it sails west
// along the coast, across the screen and past the other coast yards' beaches, until it is out of sight. It comes back
// bow first along a lane of its own further out, eastward, and turns to the north into its leaving lane right off its
// own berth, from where it is pushed in alongside.
//
// Every ship has its lanes, by its berth and by direction, so two ships never meet whenever each was sent and wherever
// each is on its voyage (tests/harbour.test.mjs samples every pair): the ship at the west berth (or the only one) uses
// the inner lane to leave and the next lane out to come back; the ship at the east berth the two lanes beyond those.
// A ship crosses lanes only in the column of its own berth, where the other never comes: the west ship turns west of
// the quay's middle, the east ship's lanes are all further out than anything the west ship does. Every leg runs along
// the shore or straight off it, so the hull never meets the beach, the wall or the deck.
//
// Near the quay a ship moves at harbour pace (SLOW) and is watched; past NEAR metres it speeds up to FAST, so that it is
// soon out of sight and does not crawl along the coast for minutes; it vanishes AWAY metres west of the quay, beyond
// the picture of the view from above on a screen as wide as 21:9 and wider. In between it is not drawn. A voyage too short
// for both ends is sailed a little faster all through, so that the ends never overlap.
import { buildShip, DECK, SHIP } from './gfx/harbour.js';

const BERTH = SHIP.length + 3;           // between the middles of two ships at the quay: room for the turn between them
const MOORED = DECK.to + SHIP.fender + SHIP.beam / 2;   // the middle of a ship at the quay, south of the quay's station
const WEST = -Math.PI / 2, EAST = Math.PI / 2;           // headings: 0 is bow to the south
const INNER = 5;                          // the first lane, this far south of the berths
const TURN = 3;                           // the radius of the turn from the coming lane into the leaving lane, 2 * TURN apart
const LANES = 14;                         // between the leaving lanes of the two ships
const AWAY = 380;                         // how far west of the quay's station a ship is out of sight
const SLOW = 3, FAST = 10, NEAR = 45, ACCEL = 0.5;   // metres a second near the quay and further out; metres of harbour pace; how fast it speeds up
const T1 = NEAR / SLOW, TA = (FAST - SLOW) / ACCEL, DA = SLOW * TA + ACCEL * TA * TA / 2;
/** How far a ship has sailed `t` seconds after leaving (or will sail in the `t` seconds before it is in). */
const reach = t => (t < T1 ? SLOW * t : t < T1 + TA ? NEAR + SLOW * (t - T1) + ACCEL * (t - T1) ** 2 / 2 : NEAR + DA + FAST * (t - T1 - TA));
/** How long it takes to sail `d` metres from the quay. */
const timeFor = d => (d < NEAR ? d / SLOW : d < NEAR + DA ? T1 + (Math.sqrt(SLOW * SLOW + 2 * ACCEL * (d - NEAR)) - SLOW) / ACCEL : T1 + TA + (d - NEAR - DA) / FAST);
/** The fastest a ship is ever seen to move, in metres a second, for a voyage of `total` seconds and paths this long. */
export const topSpeed = (total, out, back) => FAST * Math.max(1, (timeFor(out) + timeFor(back)) / total);

/** A path of straight legs and arcs, each { len, at(d) -> [x, z, heading] } for d metres along it. */
const line = (x0, z0, x1, z1, heading) => ({ len: Math.hypot(x1 - x0, z1 - z0), at: d => { const k = d / Math.hypot(x1 - x0, z1 - z0) || 0; return [x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, heading]; } });
/** A half turn to the north around (cx, cz): from heading east at its south to heading west at its north. */
const turn = (cx, cz, r) => ({ len: Math.PI * r, at: d => { const f = d / r; return [cx + r * Math.sin(f), cz + r * Math.cos(f), EAST + f - 2 * Math.PI]; } });
function along(legs, d) {
  for (const leg of legs) { if (d <= leg.len) return leg.at(Math.max(0, d)); d -= leg.len; }
  const last = legs[legs.length - 1]; return last.at(last.len);
}

/**
 * The legs of ship `i` of `count`, in the world, for the quay's station at (qx, qz).
 * @returns {{ out, back, berth: [x, z] }}  out: from the berth until out of sight; back: from out of sight to the berth
 */
export function shipLegs(i, count, qx, qz) {
  const bx = qx + (i - (count - 1) / 2) * BERTH, bz = qz + MOORED, xa = qx - AWAY;
  const leave = bz + INNER + (count > 1 ? i : 0) * LANES, come = leave + 2 * TURN;
  return {
    berth: [bx, bz],
    out: [line(bx, bz, bx, leave, WEST), line(bx, leave, xa, leave, WEST)],
    back: [line(xa, come, bx, come, EAST), turn(bx, leave + TURN, TURN), line(bx, leave, bx, bz, WEST)],
  };
}
const length = legs => legs.reduce((n, leg) => n + leg.len, 0);

/**
 * Where ship `i` of `count` is, from the rules alone.
 * @param ship  { left, total } of js/sim/port.js: seconds of the voyage left, and of all of it (left 0: at the quay)
 * @returns {{ x, z, heading, seen }}  seen: false while it is out of sight in the middle of its voyage
 */
export function shipPlace(i, count, ship, qx, qz) {
  const legs = shipLegs(i, count, qx, qz);
  if (!(ship.left > 0)) return { x: legs.berth[0], z: legs.berth[1], heading: WEST, seen: true };
  const out = length(legs.out), back = length(legs.back);
  const quick = Math.max(1, (timeFor(out) + timeFor(back)) / Math.max(1, ship.total));   // a voyage too short for both ends: faster
  const gone = reach((ship.total - ship.left) * quick), coming = reach(ship.left * quick);
  const [x, z, heading] = gone < out ? along(legs.out, gone) : coming < back ? along(legs.back, back - coming) : along(legs.out, out);
  return { x, z, heading, seen: gone < out || coming < back };
}

export class Ships {
  constructor(game) { this.game = game; this.list = []; }
  update() {
    const quay = this.game.quay, port = this.game.company.port;
    const want = quay ? port.ships.length : 0;
    while (this.list.length < want) { const s = buildShip(); this.game.scene.add(s.g); this.list.push(s); }
    while (this.list.length > want) this.game.scene.remove(this.list.pop().g);
    if (!want) return;
    const size = this.game.company.holdSize();
    this.list.forEach((s, i) => {
      const ship = port.ships[i], at = shipPlace(i, want, ship, quay.x, quay.z);
      s.g.position.set(at.x, 0, at.z);
      s.g.rotation.y = at.heading;
      const seen = at.seen && this.game.seen(at.x, at.z, 12);
      s.g.visible = seen; s.g.matrixWorldAutoUpdate = seen;
      const full = Math.ceil(Math.min(1, port.aboard(ship) / size) * s.crates.length);
      s.crates.forEach((c, k) => { c.visible = k < full; });
    });
  }
}
