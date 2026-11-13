// The trucks of the truck routes, made visible. Each route the company owns has one truck that drives
// from the machine that makes the goods to the machine that needs them, waits a moment and drives
// back empty. They are for show: how much a route carries is decided by the rules in js/sim/company.js.
import * as THREE from 'three';
import { box, cyl, mat, GLOW, LIGHT, METAL } from './world.js';
import { beamMap, softShadow } from './textures.js';
import { ITEMS } from './data/areas.js';
import { bend, pace, wayAround } from './sim/yard.js';

const SPEED = 6.5, WAIT = 1.4;
const PAINT = [0xd63a2f, 0x2f7fd6, 0xe0a52f, 0x3aa35a, 0x8e5bd6];
const STOP = { x: 5.4, z: 2.6 };   // where a truck stops, from the middle of a machine: beside the end of its belt, a truck's nose away from it, clear of whoever works there

// Every truck shares its lamps with the others: two materials that glow after dark, and the patch of
// light the headlights throw on the road (a bright see-through shape, not a light).
let kit = null;
function lights() {
  if (kit) return kit;
  const head = mat(0xfff3b0, { emissive: 0xffe08a, emissiveIntensity: 0.3 }); head.userData.byDay = 0.3; GLOW.push(head);
  const tail = mat(0xc2352b, { emissive: 0xff2a1f, emissiveIntensity: 0.1 }); tail.userData.byDay = 0.1; GLOW.push(tail);
  const beam = new THREE.MeshBasicMaterial({ color: 0xfff0c4, alphaMap: beamMap(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  beam.userData.full = 0.55; beam.visible = false; LIGHT.push(beam);
  return (kit = { head, tail, beam, lampGeo: new THREE.BoxGeometry(0.22, 0.14, 0.05), beamGeo: new THREE.PlaneGeometry(2.8, 5.6).rotateX(-Math.PI / 2) });
}

function model(paint, cargoColor) {
  const g = new THREE.Group(), L = lights();
  g.add(softShadow(2.6, 3.6, { opacity: 0.4 }));
  const bed = box(1.5, 0.22, 2.3, 0x4a4f57, { round: 0.05, metalness: 0.4, roughness: 0.5 }); bed.position.set(0, 0.62, -0.5); g.add(bed);
  const cab = box(1.5, 1.05, 1.1, paint, { round: 0.16, fine: 2, roughness: 0.35, metalness: 0.3 }); cab.position.set(0, 1.0, 1.25); g.add(cab);
  const glass = box(1.3, 0.42, 0.06, 0xbfe6ff, { map: null, roughness: 0.06, metalness: 0.4, envMapIntensity: 1 }); glass.position.set(0, 1.2, 1.81); g.add(glass);
  const bumper = box(1.56, 0.2, 0.16, 0xc9ced2, { ...METAL, map: null }); bumper.position.set(0, 0.5, 1.84); g.add(bumper);
  for (const x of [-0.5, 0.5]) {
    const lamp = new THREE.Mesh(L.lampGeo, L.head); lamp.position.set(x, 0.78, 1.82); g.add(lamp);
    const rear = new THREE.Mesh(L.lampGeo, L.tail); rear.position.set(x * 1.1, 0.62, -1.66); g.add(rear);
  }
  // the headlights on the road ahead: there at night, gone by day (js/sky.js fades it)
  const beam = new THREE.Mesh(L.beamGeo, L.beam); beam.position.set(0, 0.04, 1.9 + 2.8); beam.renderOrder = 3; g.add(beam);
  const wheels = [];
  for (const [x, z] of [[-0.78, 1.15], [0.78, 1.15], [-0.78, -1.05], [0.78, -1.05]]) {
    const w = cyl(0.36, 0.36, 0.26, 0x1d1f22, 14, { roughness: 0.9 }); w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); wheels.push(w);
  }
  const cargo = new THREE.Group(); cargo.position.set(0, 0.73, -0.5); g.add(cargo);
  for (const [x, y, z] of [[-0.34, 0.25, 0.5], [0.34, 0.25, 0.5], [-0.34, 0.25, -0.45], [0.34, 0.25, -0.45], [0, 0.75, 0]]) {
    const crate = box(0.62, 0.5, 0.85, cargoColor, { round: 0.05 }); crate.position.set(x, y, z); cargo.add(crate);
  }
  return { g, wheels, cargo };
}

export class Trucks {
  constructor(game) { this.game = game; this.list = new Map(); this.blocks = null; }

  /**
   * The points a truck drives through from one machine to the other: by way of the gates between the
   * yards, and around every machine and counter that stands in between, as the workers walk.
   */
  path(from, to) {
    const game = this.game, end = { x: to.x - STOP.x, z: to.z + STOP.z };
    const pts = [{ x: from.x + STOP.x, z: from.z + STOP.z }];
    const around = (a, b) => game.route(a, b);
    for (let i = 0; i < 12; i++) {
      const last = pts[pts.length - 1], next = game.waypoint(last, end);
      const way = wayAround(around, last, { x: next.x, z: next.z });
      for (let k = 1; k < way.length; k++) pts.push(way[k]);
      if (next === end) return pts;
    }
    return null;   // no way through: a gate in between is closed
  }

  /** The road of a route: its stretches, how sharp the bend at each end of a stretch is, and its length. Null when there is no way. */
  road(def) {
    const game = this.game;
    const from = game.area(def.from)?.stations.find(s => s.type === 'processor' && s.recipe.output === def.item);
    const to = game.area(def.to)?.stations.find(s => s.type === 'processor' && s.sim.uses(def.item));
    const pts = from && to && this.path(from, to);
    if (!pts) return null;
    const legs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len > 0.01) { legs.push({ a, nx: (b.x - a.x) / len, nz: (b.z - a.z) / len, start: total, len }); total += len; }
    }
    if (!legs.length) return null;
    // bends[i] is the bend where stretch i begins; both ends of the road are stops
    const bends = legs.map((l, i) => i === 0 ? 1 : bend(legs[i - 1].nx, legs[i - 1].nz, l.nx, l.nz));
    bends.push(1);
    return { legs, bends, total };
  }

  make(def, n) {
    const road = this.road(def);
    if (!road) return null;
    const m = model(PAINT[n % PAINT.length], ITEMS[def.item].mesh?.color ?? 0xb5742f);
    this.game.scene.add(m.g);
    return { ...m, ...road, def, s: 0, dir: 1, wait: 0, heading: Math.atan2(road.legs[0].nx, road.legs[0].nz) };
  }

  update(dt) {
    const game = this.game, c = game.company;
    // A machine was built or a yard opened: what stands in the way has changed, so every road is laid again.
    // A truck keeps its place along the road, as a share of its length.
    const blocks = game.blocks();
    if (blocks !== this.blocks) {
      this.blocks = blocks;
      for (const [id, t] of this.list) {
        if (!t) continue;
        const road = this.road(t.def);
        if (!road) { game.scene.remove(t.g); this.list.delete(id); continue; }
        t.s = Math.min(1, t.s / t.total) * road.total;
        t.legs = road.legs; t.bends = road.bends; t.total = road.total;
      }
    }
    c.routeDefs.forEach((def, n) => {
      const on = !!c.routes[def.id] && !!c.mods.routes;
      let t = this.list.get(def.id);
      if (!on) { if (t) { game.scene.remove(t.g); this.list.delete(def.id); } return; }
      if (t === undefined) { t = this.make(def, n); this.list.set(def.id, t); }   // null is remembered: no way through yet
      if (!t) { if ((this.retry = (this.retry || 0) + dt) > 5) { this.retry = 0; this.list.delete(def.id); } return; }
      this.drive(t, dt);
    });
  }

  drive(t, dt) {
    let i = t.legs.findIndex(l => t.s <= l.start + l.len);
    if (i < 0) i = t.legs.length - 1;
    let leg = t.legs[i], along = t.s - leg.start;
    if (t.wait > 0) { t.wait -= dt; if (t.wait <= 0) { t.dir = -t.dir; t.cargo.visible = t.dir > 0; } }
    else {
      // It slows before a stop and before a bend, more the sharper the bend, and picks up speed again after it.
      const ahead = t.dir > 0 ? leg.len - along : along, behind = leg.len - ahead;
      const speed = SPEED * Math.min(pace(ahead, t.bends[t.dir > 0 ? i + 1 : i]), pace(behind, t.bends[t.dir > 0 ? i : i + 1], 2.4));
      t.s += speed * dt * t.dir;
      if (t.s >= t.total || t.s <= 0) { t.s = Math.max(0, Math.min(t.total, t.s)); t.wait = WAIT; }
      for (const w of t.wheels) w.rotation.x += speed * dt * 2.6;
      i = t.legs.findIndex(l => t.s <= l.start + l.len);
      if (i < 0) i = t.legs.length - 1;
      leg = t.legs[i]; along = t.s - leg.start;
    }
    const x = leg.a.x + leg.nx * along, z = leg.a.z + leg.nz * along;
    t.g.position.set(x, t.wait > 0 ? 0 : Math.abs(Math.sin(t.s * 3)) * 0.02, z);   // a slight rattle on the move
    const want = Math.atan2(leg.nx * t.dir, leg.nz * t.dir);
    let d = want - t.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    t.heading += d * Math.min(1, dt * 6);
    t.g.rotation.y = t.heading;
    const seen = this.game.seen(x, z, 9);   // the headlights reach ahead of it
    t.g.visible = seen; t.g.matrixWorldAutoUpdate = seen;
  }
}
