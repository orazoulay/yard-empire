// Customers at the shops, for show. When goods are being sold, now and then somebody walks in from
// the edge of the yard to the end of the counter, waits a moment, and walks off with a parcel.
// They buy nothing and change nothing: what is sold and for how much is decided by the rules alone.
// There are never more than a few, each shop has one at a time, and the figures are used again.
import * as THREE from 'three';
import { box } from './world.js';
import { softShadow } from './textures.js';

const MAX = 3;            // customers in the whole game at one time
const SPEED = 3.1;        // a stroll, slower than a worker
const PAUSE = 1.0;        // seconds at the counter
const FADE = 0.25;        // seconds to appear at the edge of the yard, and to go
const GAP = [7, 14];      // seconds between two customers at the same shop
const SHIRT = [0x4f7fd6, 0xd6604f, 0x8e5bd6, 0xe0a52f, 0x3aa39a, 0xd94f8a];
const PANTS = [0x3b4654, 0x5a4a3a, 0x2f3d5c];
const SKIN = [0xf1c8a0, 0xe0ac7e, 0xc68a5c, 0x9c6a43];
const HAIR = [0x3b2a1e, 0x6b4a2b, 0x1f1a17, 0xb5803f, 0xd9d2c4];

class Customer {
  constructor(scene, n) {
    const g = this.group = new THREE.Group();
    const shirt = SHIRT[n % SHIRT.length], skin = SKIN[n % SKIN.length];
    this.legs = [-0.17, 0.17].map(x => {
      const hip = new THREE.Group(); hip.position.set(x, 0.68, 0);
      const leg = box(0.26, 0.62, 0.3, PANTS[n % PANTS.length], { round: 0.06 }); leg.position.y = -0.33; hip.add(leg);
      g.add(hip); return hip;
    });
    const body = box(0.7, 0.72, 0.44, shirt, { round: 0.12 }); body.position.y = 1.02; g.add(body);
    const head = box(0.5, 0.48, 0.5, skin, { round: 0.13 }); head.position.y = 1.64; g.add(head);
    const hair = box(0.54, 0.2, 0.54, HAIR[(n * 2 + 1) % HAIR.length], { round: 0.08, map: null }); hair.position.y = 1.86; g.add(hair);
    // the parcel they leave with: brown paper and a band around it
    this.parcel = new THREE.Group(); this.parcel.position.set(0, 1.0, 0.42); this.parcel.visible = false; g.add(this.parcel);
    this.parcel.add(box(0.5, 0.38, 0.36, 0xc99a5b, { round: 0.04 }));
    const band = box(0.1, 0.4, 0.38, 0xf4ecd8, { map: null }); band.castShadow = false; this.parcel.add(band);
    g.add(softShadow(1.6, 1.6, { round: true, opacity: 0.28 }));
    g.scale.setScalar(0.92);   // a little smaller than the people who work here
    g.visible = false;
    scene.add(g);
    this.free = true; this.t = 0; this.walk = 0;
  }
}

export class Customers {
  constructor(scene) { this.scene = scene; this.pool = []; this.next = new Map(); this.clock = 0; this.active = 0; }

  /**
   * Goods were just sold at `shop`: now and then, send somebody to its counter.
   * @param bounds  the yard the shop stands in: the customer comes in from its edge
   */
  sold(shop, bounds) {
    const due = this.next.get(shop);
    if (due === undefined) { this.next.set(shop, this.clock + 1 + Math.random() * 4); return; }   // not at the very first sale
    if (this.clock < due || this.active >= MAX) return;
    this.next.set(shop, this.clock + GAP[0] + Math.random() * (GAP[1] - GAP[0]));
    let c = this.pool.find(q => q.free);
    if (!c) { c = new Customer(this.scene, this.pool.length); this.pool.push(c); }
    // They come along the row the counter stands in, to whichever end of it is drawn, and leave the way they came.
    const side = Math.random() < 0.5 ? -1 : 1, z = shop.z + 2.3;
    c.from = { x: side < 0 ? bounds.minX + 1.1 : bounds.maxX - 1.1, z };
    c.to = { x: shop.x + side * 3.5, z };
    c.face = side < 0 ? Math.PI / 2 : -Math.PI / 2;   // toward the counter
    c.x = c.from.x; c.z = c.from.z; c.phase = 'in'; c.t = 0; c.free = false;
    c.parcel.visible = false; c.group.visible = true; c.group.scale.setScalar(0.01);
    this.active++;
  }

  update(dt, game) {
    this.clock += dt;
    if (!this.active) return;
    for (const c of this.pool) {
      if (c.free) continue;
      c.t += dt;
      let heading = c.face, moving = false;
      if (c.phase === 'in' || c.phase === 'out') {
        const goal = c.phase === 'in' ? c.to : c.from, dx = goal.x - c.x, d = Math.abs(dx), step = SPEED * dt;
        heading = dx > 0 ? Math.PI / 2 : -Math.PI / 2; moving = true;
        if (d <= step) { c.x = goal.x; c.phase = c.phase === 'in' ? 'buy' : 'gone'; c.t = 0; }
        else c.x += Math.sign(dx) * step;
      } else if (c.phase === 'buy') {
        if (c.t > PAUSE * 0.55 && !c.parcel.visible) { c.parcel.visible = true; c.parcel.scale.setScalar(0.3); }   // handed over the counter
        if (c.parcel.visible) c.parcel.scale.setScalar(Math.min(1, c.parcel.scale.x + dt * 6));
        if (c.t > PAUSE) { c.phase = 'out'; c.t = 0; }
      } else if (c.t > FADE) {   // gone: back at the edge of the yard
        c.free = true; c.group.visible = false; this.active--;
        continue;
      }
      // appear at the edge, and shrink away there at the end
      const size = c.phase === 'gone' ? 1 - c.t / FADE : c.phase === 'in' ? Math.min(1, c.t / FADE) : 1;
      c.group.scale.setScalar(Math.max(0.01, 0.92 * size));
      c.walk = moving ? c.walk + dt * 8 : 0;
      const swing = Math.sin(c.walk) * 0.6;
      c.legs[0].rotation.x = swing; c.legs[1].rotation.x = -swing;
      c.group.position.set(c.x, moving ? Math.abs(Math.sin(c.walk)) * 0.06 : 0, c.z);
      c.group.rotation.y = heading;
      c.group.visible = game.seen(c.x, c.z, 3);
    }
  }
}
