// Where anyone may walk: the open yards and doors, the footprints of machines and counters the player walks around,
// the route the arrows and the workers take, and which yard a point is in.
import { SITE } from '../data/builds.js';
import { siteWalk } from '../sim/site.js';

const inRect = (p, r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
const WALK = siteWalk();                 // the ground of the building site the player may step on, and the passage to it
// The way between the building site and the Workers' Park: the lane runs straight south from the opening in the site's
// fence to the park's gate. A walker within LINED of its middle line goes through both openings in a straight line;
// one who is not is led first to the inside of the opening on their side, as at the site's west opening.
const LANE_X = (WALK.lane.minX + WALK.lane.maxX) / 2, LINED = 1;
const SITE_SIDE = { x: LANE_X, z: WALK.plot.maxZ - 0.6 };   // just inside the site's south opening
const PARK_SIDE = { x: LANE_X, z: WALK.park.minZ + 0.6 };   // just inside the park's gate
/** True when the straight line from a to b passes through the rectangle r. */
function crosses(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [p, q] of [[-dx, a.x - r.minX], [dx, r.maxX - a.x], [-dz, a.z - r.minZ], [dz, r.maxZ - a.z]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 0.001;
}

/** The movement rules of the Game. */
export class MovementMethods {
  allowed(p) {
    for (const a of this.areas) if (a.open && inRect(p, a.walkRect)) return true;
    for (const d of this.doors) if (this.econ.has(d.gateId) && inRect(p, d.rect)) return true;
    // the building site, once it is open: the plot, and the passage from the Department Store through the two openings
    if (this.company.siteOpen && (inRect(p, WALK.plot) || inRect(p, WALK.door))) return true;
    // and the Workers' Park once it is begun: down the lane from the opening in the site's south fence, and inside the park's own
    if (this.parkOpen && (inRect(p, WALK.park) || inRect(p, WALK.lane))) return true;
    return false;
  }
  /** Returns where a move from prev to next may end: full move, a slide along a wall, or prev. */
  clampMove(prev, next) {
    if (this.allowed(next)) return next;
    const sx = { x: next.x, z: prev.z }; if (this.allowed(sx)) return sx;
    const sz = { x: prev.x, z: next.z }; if (this.allowed(sz)) return sz;
    return prev;
  }
  areaAt(p) { return this.areas.find(a => a.open && a.contains(p)) || null; }
  /** The footprints nobody walks through: every machine with its belt, the shop counters and the Port's quay, of the open yards. */
  blocks() {
    if (this._blocks) return this._blocks;
    const out = [];
    for (const a of this.areas) if (a.open) for (const s of a.stations) {
      if (s.type === 'processor') out.push({ minX: s.x - 3.5, maxX: s.x + 3.5, minZ: s.z - 1.4, maxZ: s.z + 3.9 });   // the body, the belt in front of it, and a step of clear ground
      else if (s.type === 'shop') out.push({ minX: s.x - 2.75, maxX: s.x + 2.75, minZ: s.z + 1.45, maxZ: s.z + 3.35 });
      else if (s.type === 'quay') out.push({ minX: s.x - 6, maxX: s.x + 6, minZ: s.z + 0.9, maxZ: s.z + 5.9 });   // its deck (js/gfx/harbour.js): the player stands in front of it
    }
    out.push(...this.siteRects);   // on the building site: finished buildings, and the walls of the one in work
    return (this._blocks = out);
  }
  /** Where the player may step: inside the yards and doors like everyone, and not through a machine or a counter. */
  clampPlayer(prev, next) {
    const blocks = this.blocks();
    if (blocks.some(r => inRect(prev, r))) return this.clampMove(prev, next);   // a machine was built where the player stands: let them walk out
    const free = p => this.allowed(p) && !blocks.some(r => inRect(p, r));
    if (free(next)) return next;
    const sx = { x: next.x, z: prev.z }; if (free(sx)) return sx;
    const sz = { x: prev.x, z: next.z }; if (free(sz)) return sz;
    return prev;
  }
  /**
   * Where the arrows end for the zone they lead to: its middle, or, when that lies inside a footprint nobody walks
   * through (a machine's pads lie on its belt), the spot where a worker stands to use it (standAt). A route skips the
   * footprint its end is in, so arrows to the middle of a pad ran straight into the machine from behind or beside it.
   * @param zone  the zone, or null  @param from  where the player stands
   */
  guideAim(zone, from) {
    if (!zone || typeof zone.station?.standAt !== 'function' || !this.blocks().some(r => inRect(zone, r))) return zone;
    return zone.station.standAt(zone, from);
  }
  /** The way to walk from a to b, for the arrows and for the workers: straight, or around the machine that stands in between. */
  route(a, b) {
    const loX = Math.min(a.x, b.x), hiX = Math.max(a.x, b.x), loZ = Math.min(a.z, b.z), hiZ = Math.max(a.z, b.z);   // only what lies between the two can be in the way
    const hit = this.blocks().find(r => r.maxX > loX && r.minX < hiX && r.maxZ > loZ && r.minZ < hiZ && !inRect(a, r) && !inRect(b, r) && crosses(a, b, r));
    if (!hit) return [a, b];
    const m = 0.8, c = { fl: { x: hit.minX - m, z: hit.maxZ + m }, fr: { x: hit.maxX + m, z: hit.maxZ + m }, bl: { x: hit.minX - m, z: hit.minZ - m }, br: { x: hit.maxX + m, z: hit.minZ - m } };
    const ways = [[c.fl], [c.fr], [c.bl], [c.br], [c.fl, c.bl], [c.bl, c.fl], [c.fr, c.br], [c.br, c.fr]];   // around one corner, or around one end
    let best = null;
    for (const via of ways) {
      const pts = [a, ...via, b];
      let len = 0, clear = true;
      for (let i = 1; i < pts.length && clear; i++) { clear = !crosses(pts[i - 1], pts[i], hit); len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); }
      if (clear && (!best || len < best.len)) best = { pts, len };
    }
    return best ? best.pts : [a, b];
  }

  /**
   * Where a point lies on the way to the Workers' Park, once it is begun: 'park' inside its fence, 'lane' between the
   * two fences, '' anywhere else. Asked of the point itself: the workers and the trucks are asked about too.
   */
  parkSide(p) {
    if (!this.parkOpen) return '';
    if (inRect(p, WALK.park) || (inRect(p, WALK.lane) && p.z > SITE.park.minZ)) return 'park';
    return inRect(p, WALK.lane) && p.z > WALK.plot.maxZ ? 'lane' : '';
  }
  /** Next point to walk toward to reach `target`: through a door when it is in another area, through the openings to and from the site and the park. */
  waypoint(pos, target) {
    // Between the site and the park, through the lane: first to the inside of the opening on this side unless lined up with it.
    const from = this.parkSide(pos), to = this.parkSide(target), lined = Math.abs(pos.x - LANE_X) <= LINED;
    if (from === 'park') return to === 'park' ? target : !lined ? PARK_SIDE : to === 'lane' ? target : SITE_SIDE;
    if (from === 'lane') return to === 'lane' ? target : to === 'park' ? PARK_SIDE : SITE_SIDE;
    if (to && inRect(pos, WALK.plot)) return !lined ? SITE_SIDE : to === 'lane' ? target : PARK_SIDE;
    // From the building site the way to anything in a yard leads out through its opening: first to the plot's side of it, then through.
    if (this.onSite && pos.x > SITE.gate.x) return pos.x > SITE.plot.minX + 1.4 && Math.abs(pos.z - SITE.gate.at) > 1 ? { x: SITE.plot.minX + 1.4, z: SITE.gate.at } : { x: SITE.gate.x - 1.4, z: SITE.gate.at };
    const A = this.areaAt(pos), B = this.areaAt(target);
    if (!A || !B || A === B) return target;
    const d = this.firstDoor(A.id, B.id);
    if (!d) return target;
    const mine = d.a === A.id ? d.pa : d.pb, other = d.a === A.id ? d.pb : d.pa;
    return inRect(pos, d.rect) ? other : mine;
  }
  /** First door on the shortest open route from area `from` to area `to` (breadth-first over doors). */
  firstDoor(from, to) {
    const open = this.doors.filter(d => this.econ.has(d.gateId));
    const queue = [[from, null]], seen = new Set([from]);
    while (queue.length) {
      const [id, first] = queue.shift();
      if (id === to) return first;
      for (const d of open) {
        const next = d.a === id ? d.b : d.b === id ? d.a : null;
        if (!next || seen.has(next)) continue;
        seen.add(next); queue.push([next, first || d]);
      }
    }
    return null;
  }

  area(id) { return this.areas.find(a => a.id === id); }
}
