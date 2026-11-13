// Builders on the lot of the build in work, for show. While goods are reaching the site they carry a few from
// the pile to the walls, work there a moment and walk back; when nothing arrives they stand by the pile.
// They build nothing and change nothing: what the site has is decided by the rules alone (js/sim/company.js).
// There are two of them, one on the low graphics level, and none while no build is in work.
import { Character } from './characters.js';

const SPEED = 3.4;                 // a working walk, slower than a yard's helpers
const WORK = [2.4, 4.2];           // seconds at the wall
const LOAD = 0.9;                  // seconds at the pile, picking up
const LOOKS = [{ shirt: 0x3f7fd0, pants: 0x3b4654, helmet: 0xf2c230, vest: 0xf2a900 }, { shirt: 0xd8d2c4, pants: 0x2f3d5c, helmet: 0xf2c230, vest: 0xe2572f, skin: 0xc68a5c, hair: 0x1f1a17 }];
const CARRIES = 3;                 // goods in the arms on the way to the wall

/** Where the builders stand, in the lot's own coordinates (x east, z south): by the pallet, and along the front and the west wall. */
export function builderSpots(shape) {
  const w = shape.width, d = shape.depth, south = d / 2;
  return {
    pile: [[w / 2 + 1.6, south + 2.5], [w / 2 + 0.3, south + 2.3]],   // in front of the pallet and beside it: the pallet stands near the plot's fence
    walls: [[-w * 0.34, south + 1.4], [w * 0.4, south + 1.4], [-w / 2 - 1.2, 0], [w / 2 + 1.2, -d * 0.2]],   // at the front, clear of the doorway, and at the two sides
  };
}

export class Builders {
  constructor(scene) { this.scene = scene; this.crew = []; this.state = null; this.lotKey = ''; }

  /**
   * What the builders have to go on, told once a second.
   * @param state  null for no build in work, or { lot: [x, z], shape, working, count, item }:
   *               working: goods reached the site in the last seconds; item: the goods to carry
   */
  set(state) {
    this.state = state;
    const want = state ? state.count : 0;
    while (this.crew.length < want) {
      const c = new Character(this.scene, { ...LOOKS[this.crew.length % LOOKS.length], speed: SPEED, ring: 0 });
      c.seen = true;   // two figures on one lot: always posed
      this.crew.push({ c, phase: 'rest', t: 0, goal: null, turn: this.crew.length });
    }
    this.crew.forEach((b, i) => { b.c.group.visible = i < want; });
    if (!state) return;
    const key = state.lot.join(',');
    if (key !== this.lotKey) {   // a new build: the crew is at its pile
      this.lotKey = key;
      const spots = builderSpots(state.shape);
      this.crew.forEach((b, i) => { const [x, z] = spots.pile[i % spots.pile.length]; b.c.pos.set(state.lot[0] + x, 0.04, state.lot[1] + z); b.phase = 'rest'; b.t = 0; this.hands(b, false); });
    }
  }
  hands(b, full) { b.c.carry.type = full ? this.state?.item || 'brick' : null; b.c.carry.count = full ? CARRIES : 0; }

  update(dt) {
    const s = this.state;
    if (!s) return;
    const spots = builderSpots(s.shape), at = ([x, z]) => ({ x: s.lot[0] + x, z: s.lot[1] + z });
    this.crew.forEach((b, i) => {
      if (i >= s.count) return;
      const c = b.c;
      b.t += dt;
      if (b.phase === 'rest' && s.working && b.t > 0.6 + i * 1.3) { b.phase = 'load'; b.t = 0; }
      else if (b.phase === 'load' && b.t > LOAD) {
        if (!s.working) { b.phase = 'rest'; b.t = 0; }
        else { this.hands(b, true); b.goal = at(spots.walls[b.turn++ % spots.walls.length]); b.phase = 'toWall'; b.span = WORK[0] + Math.random() * (WORK[1] - WORK[0]); }
      } else if (b.phase === 'work' && b.t > b.span) { b.goal = at(spots.pile[i % spots.pile.length]); b.phase = 'toPile'; }
      let vx = 0, vz = 0, len = 0;
      if (b.phase === 'toWall' || b.phase === 'toPile') {
        const dx = b.goal.x - c.pos.x, dz = b.goal.z - c.pos.z, dist = Math.hypot(dx, dz);
        if (dist < Math.max(0.12, SPEED * dt)) {
          c.pos.x = b.goal.x; c.pos.z = b.goal.z; b.t = 0;
          if (b.phase === 'toWall') { b.phase = 'work'; this.hands(b, false); c.squash = 1; } else b.phase = 'load';
        } else { vx = dx / dist; vz = dz / dist; len = 1; }
      }
      if (b.phase === 'work') { const d = Math.atan2(s.lot[0] - c.pos.x, s.lot[1] - c.pos.z) - c.heading; c.heading += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 8); }   // turns to face the building, the short way round
      c.move(vx, vz, len, dt);
      if (b.phase === 'work') { c.armR.rotation.x = -1.5 + Math.sin(b.t * 13) * 0.7; c.armR.rotation.z = -0.15; }   // a hammer's swing, after the pose
    });
  }
}
