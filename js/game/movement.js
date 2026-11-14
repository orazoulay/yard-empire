// Where anyone may walk: the open yards and doors, the footprints of machines and counters the player walks around,
// the route the arrows and the workers take, and which yard a point is in.
import { SITE } from '../data/builds.js';
import { siteWalk } from '../sim/site.js';

const inRect = (p, r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
const WALK = siteWalk();                 // the ground of the building site the player may step on, and the passage to it
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
  /** Next point to walk toward to reach `target`, going through a door when it is in another area. */
  /** The footprints nobody walks through: every machine with its belt, and the shop counters, of the open yards. */
  blocks() {
    if (this._blocks) return this._blocks;
    const out = [];
    for (const a of this.areas) if (a.open) for (const s of a.stations) {
      if (s.type === 'processor') out.push({ minX: s.x - 3.5, maxX: s.x + 3.5, minZ: s.z - 1.4, maxZ: s.z + 3.9 });   // the body, the belt in front of it, and a step of clear ground
      else if (s.type === 'shop') out.push({ minX: s.x - 2.75, maxX: s.x + 2.75, minZ: s.z + 1.45, maxZ: s.z + 3.35 });
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

  waypoint(pos, target) {
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
