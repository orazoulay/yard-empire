// The Yard Dog, bought with credits: a small low-poly dog that trots after the player and sits when they stop.
// It is only looked at: it carries nothing, blocks nobody and changes nothing in the game.
import * as THREE from 'three';
import { box } from './world.js';
import { softShadow } from './textures.js';

const FUR = 0xc98a4b, DARK = 0x6b4226, NOSE = 0x222222;
const BEHIND = 1.5;     // how far behind the player it keeps
const SPEED = 9;        // it catches up quicker than anyone walks
const SIDE = 0.9;       // and walks a little to the side, so it is not hidden behind the player's legs
const SIZE = 1.35;      // drawn a little larger than life beside the figures

export class Pet {
  constructor(scene) {
    const g = this.group = new THREE.Group();
    const body = box(0.42, 0.34, 0.8, FUR, { round: 0.1 }); body.position.y = 0.48; g.add(body);
    this.head = new THREE.Group(); this.head.position.set(0, 0.74, 0.42); g.add(this.head);
    const skull = box(0.36, 0.32, 0.34, FUR, { round: 0.1 }); this.head.add(skull);
    const snout = box(0.2, 0.16, 0.2, DARK, { round: 0.05 }); snout.position.set(0, -0.05, 0.22); this.head.add(snout);
    const nose = box(0.08, 0.06, 0.05, NOSE, { map: null }); nose.position.set(0, 0, 0.33); nose.castShadow = false; this.head.add(nose);
    for (const x of [-0.13, 0.13]) {
      const ear = box(0.1, 0.18, 0.08, DARK, { round: 0.03 }); ear.position.set(x, 0.2, -0.04); this.head.add(ear);
      const eye = box(0.05, 0.06, 0.03, NOSE, { map: null }); eye.position.set(x * 0.7, 0.05, 0.17); eye.castShadow = false; this.head.add(eye);
    }
    this.legs = [[-0.13, 0.28], [0.13, 0.28], [-0.13, -0.28], [0.13, -0.28]].map(([x, z]) => {
      const hip = new THREE.Group(); hip.position.set(x, 0.34, z); g.add(hip);
      const leg = box(0.11, 0.32, 0.11, FUR, { round: 0.04 }); leg.position.y = -0.16; hip.add(leg);
      return hip;
    });
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.6, -0.4); g.add(this.tail);
    const tail = box(0.07, 0.07, 0.32, DARK, { round: 0.03 }); tail.position.z = -0.14; tail.rotation.x = -0.6; this.tail.add(tail);
    g.add(softShadow(1.1, 1.3, { round: true, opacity: 0.26 }));
    g.scale.setScalar(SIZE);   // a little larger than life beside the figures, or a phone shows only a speck
    g.visible = false;
    scene.add(g);
    this.pos = new THREE.Vector3(); this.heading = 0; this.t = 0; this.placed = false;
  }

  /**
   * @param player  the player's Character: where it is and which way it faces
   * @param shown   the dog is owned (the server said so) and the game is drawn as usual
   */
  update(dt, player, shown) {
    this.group.visible = shown;
    if (!shown) { this.placed = false; return; }
    const p = player.pos, h = player.heading;
    const want = { x: p.x - Math.sin(h) * BEHIND + Math.cos(h) * SIDE, z: p.z - Math.cos(h) * BEHIND - Math.sin(h) * SIDE };
    if (!this.placed || Math.hypot(want.x - this.pos.x, want.z - this.pos.z) > 12) { this.pos.set(want.x, p.y, want.z); this.placed = true; }   // first time, or the player jumped to another yard
    const dx = want.x - this.pos.x, dz = want.z - this.pos.z, dist = Math.hypot(dx, dz), step = Math.min(dist, SPEED * dt * Math.min(1, dist));
    const moving = dist > 0.15;
    if (moving) {
      this.pos.x += dx / dist * step; this.pos.z += dz / dist * step;
      const turn = Math.atan2(dx, dz) - this.heading;
      this.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 10);
    }
    this.pos.y += (p.y - this.pos.y) * Math.min(1, dt * 10);   // up onto a foundation with the player
    this.t += dt * (moving ? 14 : 3);
    const swing = moving ? Math.sin(this.t) * 0.7 : 0;
    this.legs.forEach((leg, i) => { leg.rotation.x = (i === 0 || i === 3 ? swing : -swing); });
    this.tail.rotation.y = Math.sin(this.t * (moving ? 1 : 2.5)) * 0.5;   // wags, faster when it stands
    this.head.rotation.x = moving ? 0 : Math.sin(this.t * 0.4) * 0.08;
    this.group.position.copy(this.pos);
    this.group.position.y += moving ? Math.abs(Math.sin(this.t)) * 0.05 : 0;
    this.group.rotation.y = this.heading;
  }
}
