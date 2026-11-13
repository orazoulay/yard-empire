// Player and worker characters: low-poly mesh, movement, carried stack, worker AI.
import * as THREE from 'three';
import { box, cyl, GLOW } from './world.js';
import { Carry } from './sim/economy.js';
import { chooseJob, bestDest, claimOf } from './sim/jobs.js';
import { Stack } from './items3d.js';
import { TUNING } from './data/tuning.js';
import { softShadow } from './textures.js';
import { AREAS, reachOf } from './data/areas.js';
import { outfitFor } from './data/looks.js';

/** A box hanging from a pivot at its top end, so it swings from the hip or the shoulder like a limb. */
function limb(w, h, d, color, x, y, end) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
  const m = box(w, h, d, color, { round: 0.07 }); m.position.y = -h / 2; pivot.add(m);
  if (end) { end.position.y += -h; pivot.add(end); }   // a hand or a boot
  return pivot;
}

// Workers are not copies of one another: each gets a skin tone, a hair colour, a helmet and a shirt from these.
const SKIN = [0xf1c8a0, 0xe0ac7e, 0xc68a5c, 0x9c6a43, 0xf6d7b8];
const HAIR = [0x3b2a1e, 0x6b4a2b, 0x1f1a17, 0xb5803f, 0x8a8f96];
const HELMET = [0xffd23f, 0xf2f2f2, 0xff8a1f, 0x4fc3f7];
const SHIRT = [0x5bd36b, 0x4fbf7f, 0x6fcf5a, 0x58c9a0];
/**
 * A hat, to sit on a head (the head's own space: its top is at 0.55).
 * hard: a safety helmet. straw: a wide brim against the sun. chef: a baker's tall white hat.
 * miner: a helmet with a lamp that glows at night. cap: a flat cap with a peak.
 */
function makeHat(kind, color) {
  const g = new THREE.Group();
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  if (kind === 'straw') {
    add(cyl(0.66, 0.7, 0.05, color, 16, { roughness: 0.95 }), 0, 0.53, 0);
    add(cyl(0.3, 0.36, 0.26, color, 14, { roughness: 0.95 }), 0, 0.68, 0);
    add(cyl(0.365, 0.365, 0.07, 0x8b4a24, 14), 0, 0.59, 0);   // the band
  } else if (kind === 'chef') {
    add(cyl(0.34, 0.34, 0.16, color, 14), 0, 0.6, 0);
    add(box(0.6, 0.34, 0.6, color, { round: 0.15, fine: 2, map: null }), 0, 0.84, 0);   // the puff on top
  } else if (kind === 'cap') {
    add(cyl(0.36, 0.38, 0.17, color, 14), 0, 0.59, 0);
    add(box(0.46, 0.05, 0.32, color, { round: 0.02 }), 0, 0.53, 0.36);   // the peak
  } else {
    add(cyl(0.38, 0.42, 0.3, color, 12, { roughness: 0.45 }), 0, 0.63, 0);
    add(cyl(0.5, 0.5, 0.08, color, 12, { roughness: 0.45 }), 0, 0.51, 0.1);
    if (kind === 'miner') {
      const lamp = add(box(0.16, 0.13, 0.08, 0xfff3b0, { map: null, emissive: 0xffe08a, emissiveIntensity: 0.4 }), 0, 0.66, 0.42);
      lamp.castShadow = false; lamp.material.userData.byDay = 0.4; GLOW.push(lamp.material);   // brighter after dark
    }
  }
  return g;
}

/** The look of worker number `n`: the same worker always looks the same. */
export function workerLook(n) {
  return { skin: SKIN[n % SKIN.length], hair: HAIR[(n * 3 + 1) % HAIR.length], helmet: HELMET[(n * 2 + n % 3) % HELMET.length], shirt: SHIRT[n % SHIRT.length] };
}

export class Character {
  constructor(scene, { shirt = 0xffd23f, pants = 0x2f6fd6, helmet = 0xff7a1a, skin = 0xf1c8a0, hair = 0x6b4a2b, vest = 0xff7a1a, hat = 'hard', apron = null, pack = false, speed = TUNING.playerSpeed, ring: ringOpacity = 0.4 }) {
    this.scene = scene;
    this.speed = speed;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.moving = 0;
    this.walkT = 0; this.idleT = Math.random() * 6;   // so a row of workers does not breathe in step
    this.squash = 0;
    this.hold = 0;                  // 0 = arms free, 1 = arms up under a stack
    this.rest = 0; this.wave = 0;   // a worker with nothing to do looks around, and waves when the player comes by
    this.lean = { x: 0, z: 0, vx: 0, vz: 0 };   // the carried stack sways on a spring
    this.carry = new Carry();
    this.actionTimer = 0;
    this.seen = true; this.back = false;   // in the camera's sight; just come back into it
    // group: where the character stands and which way it faces. rig: everything that bobs and squashes.
    this.group = new THREE.Group();
    this.rig = new THREE.Group(); this.group.add(this.rig);

    this.torso = new THREE.Group(); this.torso.position.y = 0.75; this.rig.add(this.torso);   // from the hips up
    const body = box(0.8, 0.8, 0.5, shirt, { round: 0.12 }); body.position.y = 0.4; this.torso.add(body);
    this.paint = { shirt: [body], pants: [], helmet: [], vest: [] };   // the meshes of each colour of the clothes, for dress()
    const belt = box(0.82, 0.12, 0.52, 0x8b4a24); belt.position.y = 0.03; this.torso.add(belt);
    if (vest != null) {   // two bright strips over the shoulders; not every trade wears them
      const vest1 = box(0.2, 0.7, 0.54, vest); vest1.position.set(-0.22, 0.43, 0); this.torso.add(vest1);
      const vest2 = vest1.clone(); vest2.position.x = 0.22; this.torso.add(vest2);
      this.paint.vest.push(vest1);   // the two strips share one material
    }
    if (apron != null) {  // a baker, a smith, a carpenter: an apron down the front with a bib
      const skirt = box(0.74, 0.5, 0.06, apron, { round: 0.03 }); skirt.position.set(0, 0.22, 0.27); this.torso.add(skirt);
      const bib = box(0.44, 0.34, 0.06, apron, { round: 0.03 }); bib.position.set(0, 0.6, 0.27); this.torso.add(bib);
    }
    this.head = new THREE.Group(); this.head.position.y = 0.82; this.torso.add(this.head);   // turns at the neck
    const face = box(0.6, 0.55, 0.6, skin, { round: 0.14 }); face.position.y = 0.28; this.head.add(face);
    const hairBack = box(0.62, 0.34, 0.3, hair, { round: 0.1, map: null }); hairBack.position.set(0, 0.36, -0.18); this.head.add(hairBack);
    const mouth = box(0.18, 0.04, 0.05, 0x8a4a3a, { map: null }); mouth.position.set(0, 0.14, 0.31); mouth.castShadow = false; this.head.add(mouth);
    for (const x of [-0.14, 0.14]) { const brow = box(0.14, 0.035, 0.05, hair, { map: null }); brow.position.set(x, 0.42, 0.31); brow.castShadow = false; this.head.add(brow); }
    const eyeL = box(0.08, 0.1, 0.05, 0x222222); eyeL.position.set(-0.14, 0.33, 0.31); this.head.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.14; this.head.add(eyeR);
    const hatGroup = makeHat(hat, helmet); this.head.add(hatGroup);
    hatGroup.traverse(o => { if (o.isMesh && o.material?.color?.getHex() === helmet) this.paint.helmet.push(o); });
    const hand = () => box(0.2, 0.16, 0.2, skin, { round: 0.06 });
    if (pack) {   // the player carries a pack, with a bedroll on top
      const bag = box(0.56, 0.6, 0.26, 0x7a5a36, { round: 0.1 }); bag.position.set(0, 0.42, -0.36); this.torso.add(bag);
      const roll = cyl(0.12, 0.12, 0.62, 0xd9c8a0, 10); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.78, -0.36); this.torso.add(roll);
    } else {      // a worker has a tool pouch on the belt
      const pouch = box(0.22, 0.22, 0.14, 0x6b4a2b, { round: 0.05 }); pouch.position.set(0.3, -0.02, 0.3); this.torso.add(pouch);
    }
    this.armL = limb(0.22, 0.6, 0.22, shirt, -0.52, 0.7, hand()); this.torso.add(this.armL);
    this.armR = limb(0.22, 0.6, 0.22, shirt, 0.52, 0.7, hand()); this.torso.add(this.armR);
    const boot = () => { const m = box(0.32, 0.16, 0.44, 0x3b2a1e, { round: 0.06 }); m.position.z = 0.05; return m; };
    this.legL = limb(0.3, 0.62, 0.34, pants, -0.2, 0.75, boot()); this.rig.add(this.legL);
    this.legR = limb(0.3, 0.62, 0.34, pants, 0.2, 0.75, boot()); this.rig.add(this.legR);
    this.paint.shirt.push(this.armL.children[0], this.armR.children[0]);   // a limb is its pivot with the sleeve or the trouser leg first
    this.paint.pants.push(this.legL.children[0], this.legR.children[0]);

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: ringOpacity, depthWrite: false, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.group.add(this.ring);
    this.group.add(softShadow(1.9, 1.9, { round: true, opacity: 0.32 }));   // dark right under the feet, whatever the sun does

    this.stackRoot = new THREE.Group(); this.stackRoot.position.set(0, 2.45, 0); this.rig.add(this.stackRoot);
    this.stack = new Stack(this.stackRoot, { maxVisible: 16, from: { x: 0, y: -1.9, z: 0.9 } });   // picked up from the ground in front
    scene.add(this.group);
  }

  capacityIn(econ) { return this.capacity ?? econ.capacity; }
  bounce() { this.squash = 1; }
  /**
   * Out of the camera's sight a character is not drawn, and its limbs and its stack are left alone:
   * it still walks, carries and works. When it comes back into sight the stack is caught up at once.
   */
  show(seen) {
    if (seen === this.seen) return;
    this.seen = seen; this.back = seen;
    this.group.visible = seen; this.group.matrixWorldAutoUpdate = seen;
  }

  /** Move along (vx, vz) if len > 0; `clamp(prev, next)` returns the allowed position. */
  move(vx, vz, len, dt, clamp) {
    let turn = 0;   // radians per second, for the sideways sway of the stack
    if (len > 0.05) {
      const next = { x: this.pos.x + vx * this.speed * dt, z: this.pos.z + vz * this.speed * dt };
      const p = clamp ? clamp(this.pos, next) : next;
      this.pos.x = p.x; this.pos.z = p.z;
      const target = Math.atan2(vx, vz);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = d * Math.min(1, dt * 14);
      this.heading += step;
      if (dt > 0) turn = step / dt;
      this.moving = Math.min(1, this.moving + dt * 8);
    } else {
      this.moving = Math.max(0, this.moving - dt * 8);
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    if (!this.seen) return;
    this.pose(dt, len > 0.05 ? this.speed : 0, turn);
    this.stack.set(this.carry.type, this.carry.count, this.back);
    this.stack.animate(dt);
    this.back = false;
  }

  /** The walk cycle, the breathing, the raised arms and the swaying stack. */
  pose(dt, speed, turn) {
    const m = this.moving;
    this.walkT += dt * (6 + this.speed * 0.7) * m;   // faster walkers take faster steps
    this.idleT += dt;
    this.squash = Math.max(0, this.squash - dt * 6);
    const swing = Math.sin(this.walkT) * 0.75 * m;
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.hold += ((this.carry.empty ? 0 : 1) - this.hold) * Math.min(1, dt * 12);   // the arms go up, they do not snap up
    const up = -2.8 * this.hold, free = 1 - this.hold;
    this.armL.rotation.x = up - swing * free; this.armR.rotation.x = up + swing * free;
    this.armL.rotation.z = -0.1 * free; this.armR.rotation.z = 0.1 * free;
    const breath = Math.sin(this.idleT * 2.2) * (1 - m);
    this.torso.rotation.x = 0.1 * m * free;                       // leans into the walk when the hands are free
    this.torso.rotation.y = Math.sin(this.walkT) * 0.1 * m * free;   // shoulders follow the arms
    this.torso.scale.y = 1 + breath * 0.012;
    this.head.rotation.x = -0.06 * m * free + breath * 0.015;
    this.rig.position.y = Math.abs(Math.sin(this.walkT)) * 0.09 * m;
    if (this.isWorker) {
      const k = Math.min(1, dt * 4);
      this.rest += ((this.resting && m < 0.1 ? 1 : 0) - this.rest) * k;
      this.wave += ((this.resting && this.greeting ? 1 : 0) - this.wave) * k;
      this.head.rotation.y = Math.sin(this.idleT * 0.8) * 0.5 * this.rest * (1 - this.wave);   // looks left and right
      const cycle = this.idleT % 7, brow = cycle < 1.1 ? Math.sin(Math.PI * cycle / 1.1) * this.rest * (1 - this.wave) : 0;   // now and then, a hand to the forehead
      this.armR.rotation.x += -2.3 * brow; this.armR.rotation.z += -0.45 * brow;
      this.armL.rotation.x += -2.7 * this.wave; this.armL.rotation.z += (-0.25 + Math.sin(this.idleT * 9) * 0.35) * this.wave;
    }
    this.rig.scale.set(1 + this.squash * 0.08, 1 - this.squash * 0.12, 1 + this.squash * 0.08);
    this.ring.scale.setScalar(1 + Math.sin(this.idleT * 3) * 0.035);

    // The stack leans back when the walk starts, forward when it stops, and outward in a turn.
    const L = this.lean, k = 70, damp = 7;
    const wantZ = -0.0045 * speed, wantX = Math.max(-0.05, Math.min(0.05, turn * 0.004));
    L.vz += ((wantZ - L.z) * k - L.vz * damp) * dt; L.z += L.vz * dt;
    L.vx += ((wantX - L.x) * k - L.vx * damp) * dt; L.x += L.vx * dt;
    const still = Math.abs(L.z) + Math.abs(L.x) + Math.abs(L.vz) + Math.abs(L.vx) < 0.0015 && speed === 0;
    this.stack.leanZ = still ? 0 : L.z; this.stack.leanX = still ? 0 : L.x;
  }

  /**
   * Put other colours on the clothes: the player's Outfit colours, bought with credits (js/credits.js).
   * @param colors  { shirt, pants, helmet, vest } as numbers; a part left out keeps its colour
   */
  dress(colors) {
    for (const [part, meshes] of Object.entries(this.paint)) if (colors?.[part] != null) for (const m of meshes) m.material.color.setHex(colors[part]);
  }

  get headPos() { return new THREE.Vector3(this.pos.x, 2.9 + this.stack.height, this.pos.z); }
}

/** NPC helper: runs the job chooser and walks between stations. */
const ARRIVE = 0.3;   // a worker within this distance of the spot has arrived

export class Worker extends Character {
  /** @param n  which worker of the yard this is: it decides the look */
  constructor(scene, areaId, jobCfg, n = 0) {
    // skin and hair by the worker, everything worn by the trade of the yard
    super(scene, { ...workerLook(n), ...outfitFor(AREAS.find(a => a.id === areaId), n), speed: TUNING.workerSpeed, ring: 0.2 });
    this.isWorker = true;
    this.area = areaId;
    this.jobCfg = jobCfg;
    this.capacity = TUNING.workerCapacity;
    this.reach = reachOf(areaId);   // delivers to machines here and next door, no further
    this.job = null; this.phase = null; this.wait = 0; this.retry = 0;
    this.role = undefined;          // 'feeder' or 'hauler', set by the yard from the order of hiring (js/area.js)
    this.age = 0;                   // seconds of work, for how long a dry source is left alone
    this.avoidUntil = new Map();    // source id -> age until which it is left alone: this worker found it empty
  }
  /** What this worker is, for the job choice: its yard, where it stands, what it carries, its role. */
  who() {
    const avoid = [];
    for (const [id, until] of this.avoidUntil) { if (until > this.age) avoid.push(id); else this.avoidUntil.delete(id); }
    return { area: this.area, reach: this.reach, x: this.pos.x, z: this.pos.z, carry: this.carry, role: this.role, stockBelow: TUNING.roles.stockBelow, avoid };
  }

  /** Turn on the spot toward a point. */
  turnTo(point, dt) {
    const dx = point.x - this.pos.x, dz = point.z - this.pos.z;
    if (Math.hypot(dx, dz) < 0.2) return;
    let d = Math.atan2(dx, dz) - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * Math.min(1, dt * 10);
  }
  /** What this worker has committed to, so colleagues plan around it. */
  get claim() { return this.job ? claimOf(this.job, this.phase, this.carry.count, this.capacity) : null; }

  update(dt, game) {
    this.show(game.seen(this.pos.x, this.pos.z, 3.5));
    this.resting = !this.job;
    this.greeting = this.resting && Math.hypot(game.player.pos.x - this.pos.x, game.player.pos.z - this.pos.z) < 4;
    this.age += dt;
    if (!this.job) {
      this.retry -= dt;
      if (this.retry > 0) { this.move(0, 0, 0, dt); return; }
      const views = game.stationViews();
      // A job is chosen only here, with nothing in hand: a worker never changes plan on the way or with a load.
      this.job = chooseJob(this.who(), views, this.jobCfg, game.claims(this));
      if (!this.job) { this.retry = 1; this.move(0, 0, 0, dt); return; }
      this.phase = this.job.from ? 'from' : 'to';
    }
    const j = this.job;
    const st = this.phase === 'from' ? j.from.station : j.to.station;
    const zone = st.zoneFor(this.phase === 'from' ? 'take' : 'give', j.item);
    // Walk to a spot in front of the pad (or at the edge of the pile), around any machine in the way,
    // and turn to face the work. Workers do not walk through machines or stand on the belt.
    const stand = st.standAt(zone, this.pos);
    if (Math.hypot(stand.x - this.pos.x, stand.z - this.pos.z) > ARRIVE && !(this.arrived === zone)) {
      const next = game.route(this.pos, game.waypoint(this.pos, stand))[1];
      const dx = next.x - this.pos.x, dz = next.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      this.move(dx / d, dz / d, 1, dt, (p, n) => game.clampMove(p, n));
      this.wait = 0;
      return;
    }
    this.arrived = zone;   // stays put while working here, even when the spot at a pile's edge shifts a little
    this.turnTo(zone, dt);
    this.move(0, 0, 0, dt);
    this.wait += dt;
    st.interact(this, dt, game, zone);   // workers only use the station they came for
    if (this.phase === 'from') {
      const full = this.carry.count >= this.capacity, dry = st.provides(j.item) === 0;
      if (full || (dry && this.wait > 0.5)) {
        if (this.carry.count > 0) { this.phase = 'to'; this.wait = 0; this.arrived = null; }
        else { this.avoidUntil.set(j.from.id, this.age + TUNING.roles.avoidFor); this.job = null; this.retry = 0.5; }   // found empty (perhaps the player took it): not straight back
      }
    } else {
      if (this.carry.empty) { this.job = null; this.retry = 0.2; return; }
      if (st.accepts(j.item) === 0 && this.wait > 0.5) {
        const alt = bestDest({ area: this.area, reach: this.reach, x: this.pos.x, z: this.pos.z }, game.stationViews(), j.item, game.claims(this));
        if (alt && alt.station !== st) { j.to = alt; this.wait = 0; this.arrived = null; }
        else if (this.wait > 8) { this.job = null; this.retry = 1; }
      }
    }
  }
}
