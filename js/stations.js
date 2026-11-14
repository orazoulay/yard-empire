// 3D stations built from data: Source, ProcessorStation, Shop, Plot.
import * as THREE from 'three';
import { box, cyl, mat, lit } from './world.js';
import { softShadow, stripes, wood } from './textures.js';
import { addPallet, makeItem, Stack, stackBase } from './items3d.js';
import { Processor } from './sim/processor.js';
import { RECIPES, ITEMS, AREAS } from './data/areas.js';
import { fmt } from './format.js';
import { plotTag } from './ui-logic.js';
import { lookOf } from './data/looks.js';
import { icon, EFFECT_ICON } from './icons.js';
import { TUNING } from './data/tuning.js';
import { machineTraits } from './sim/yard.js';
import { addLightPool } from './scenery.js';
import { buildMachine } from './gfx/machines.js';
import { productShape } from './gfx/products.js';
import { bake, moving } from './engine/bake.js';

const PICK_RATE = TUNING.pickRate, DROP_RATE = TUNING.dropRate, PZ = TUNING.procZone;
// The camera looks down at a slant, so a figure's head is drawn about 1.5 further "up" the screen than its feet.
// Someone who stands right at the belt is therefore drawn half on top of it. These distances leave ground to see.
const FRONT = 2.4;   // how far in front of a pad's middle a worker stands
const REACH = 1.2;   // how much further forward than its circle a pad's zone reaches, so the player can use it from there too
const EDGE = 2.7;    // how far from the middle of a pile a worker stands: at its edge

export function dashedPad(w, d, fill = 'rgba(0,0,0,0.18)') {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * d / w);
  const g = c.getContext('2d');
  g.fillStyle = fill; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#fff'; g.lineWidth = 10; g.setLineDash([34, 20]); g.strokeRect(8, 8, c.width - 16, c.height - 16);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; return m;
}

/** The moving surface of a conveyor: chevrons pointing the way the goods travel, in the colours of the yard's location. */
const beltImages = new Map();
function beltTexture({ surface, chevron }) {
  const key = surface + chevron;
  if (!beltImages.has(key)) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = surface; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = chevron; g.lineWidth = 7; g.lineJoin = 'miter';
    for (const x of [-32, 0, 32, 64]) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 22, 32); g.lineTo(x, 60); g.stroke(); }
    beltImages.set(key, c);
  }
  const tex = new THREE.CanvasTexture(beltImages.get(key));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 1); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Shrinks back to rest after a knock: 1 right after it, 0 when it is over. */
const settle = (kick, dt, rate = 5) => Math.max(0, kick - dt * rate);

export class Zone {
  /** @param front  how far the zone is stretched toward the camera (0 = a plain circle) */
  constructor(x, z, radius, kind, station, front = 0) { this.x = x; this.z = z; this.radius = radius; this.kind = kind; this.station = station; this.front = front; }
  contains(p) {
    const nearZ = this.z + Math.max(0, Math.min(this.front, p.z - this.z));   // the nearest point of the middle line
    return Math.hypot(p.x - this.x, p.z - nearZ) <= this.radius;
  }
}

class Station {
  constructor(game, area, cfg) {
    this.game = game; this.area = area; this.id = cfg.id; this.type = cfg.type;
    this.x = cfg.x; this.z = cfg.z;
    this.group = new THREE.Group(); this.group.position.set(cfg.x, 0, cfg.z); game.scene.add(this.group);
    this.zones = [];
    this.seen = true;
  }
  /**
   * Show or hide everything this station draws. A station that is out of the camera's sight is not
   * drawn, and none of its parts is moved or even looked at, until it comes into sight again; its
   * rules run all the same. Returns true when this call changed something.
   */
  show(seen) {
    if (seen === this.seen) return false;
    this.seen = seen; this.group.visible = seen; this.group.matrixWorldAutoUpdate = seen;
    return true;
  }
  provides() { return 0; }
  accepts() { return 0; }
  /** True if this station ever takes `item`, whether or not it has room right now. */
  wants() { return false; }
  /** Zone to stand in to take or give `item`. */
  zoneFor() { return this.zones[0]; }
  /** Where a worker stands to use `zone`, coming from `from`: inside the zone, and not inside the thing itself. */
  standAt(zone) { return zone; }
  update() {}
  interact() {}
  dispose() { this.game.scene.remove(this.group); }
}

// ---------------------------------------------------------------- sources
export class Source extends Station {
  constructor(game, area, cfg) {
    super(game, area, cfg);
    this.item = cfg.item;
    this.zones = [new Zone(cfg.x, cfg.z, TUNING.sourceRadius, 'take', this)];
    const field = cfg.pile === 'field';
    this.pile = new THREE.Group(); this.group.add(this.pile);   // apart from the props, so that only the pile moves
    this.kick = 0;
    this.group.add(softShadow(7.8, 6.6, { round: true, opacity: field ? 0.18 : 0.4 }));   // the ground is darker under a heap
    // the heap is one shape drawn many times over (an InstancedMesh): fifty logs cost one draw
    const n = field ? 60 : 46, shape = productShape(cfg.item), heap = new THREE.InstancedMesh(shape.geo, shape.mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * 2.9, a = Math.random() * Math.PI * 2;
      if (field) {
        p.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.85); q.identity();
        sc.set(1.1, 1.1 + Math.random() * 0.5, 1.1);
      } else {
        const tier = Math.floor(i / 14), in_ = 1 - tier * 0.24;   // each layer is smaller than the one under it: a heap, not a cylinder
        p.set(Math.cos(a) * r * 0.9 * in_, 0.12 + tier * 0.28, Math.sin(a) * r * 0.75 * in_);
        q.setFromEuler(e.set(0, Math.random() * Math.PI, 0)); sc.setScalar(1.2 + Math.random() * 0.5);
      }
      heap.setMatrixAt(i, m4.compose(p, q, sc));
    }
    heap.castShadow = true; heap.receiveShadow = true; heap.computeBoundingSphere();
    this.pile.add(heap);
    if (cfg.prop === 'mound') this.buildMound();
    if (cfg.prop === 'derrick') this.buildDerrick();
    moving(this.pile, this.pump); bake(this.group);   // the pile bounces and the pump goes up and down; the rest is joined
    this.usable = true;
    this.hint = game.labels.add('machine', '', () => ({ x: cfg.x, y: 1.6, z: cfg.z }));
  }
  dispose() { super.dispose(); this.game.labels.remove(this.hint); }
  buildMound() {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), mat(0x6f6a66, { flatShading: true }));
    rock.scale.set(1.5, 0.9, 0.8); rock.position.set(0, 1.0, -2.6); rock.castShadow = true; rock.receiveShadow = true;
    this.group.add(rock);
    const hole = box(1.6, 1.5, 0.3, 0x1c1a19); hole.position.set(0, 0.75, -1.55); this.group.add(hole);
    for (const px of [-0.95, 0.95]) { const b = box(0.22, 1.7, 0.3, 0x8b5a2b); b.position.set(px, 0.85, -1.4); this.group.add(b); }
    const lintel = box(2.2, 0.24, 0.32, 0x8b5a2b); lintel.position.set(0, 1.75, -1.4); this.group.add(lintel);
  }
  buildDerrick() {
    const g = new THREE.Group(); g.position.set(0, 0, -2.6);
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const leg = box(0.16, 4.6, 0.16, 0x4a4f57); leg.position.set(x * 0.6, 2.2, z * 0.6); leg.rotation.z = -x * 0.14; leg.rotation.x = z * 0.14; g.add(leg);
    }
    for (const y of [1.2, 2.6]) { const ring = box(1.5 - y * 0.25, 0.12, 1.5 - y * 0.25, 0x4a4f57); ring.position.y = y; g.add(ring); }
    const topCap = box(0.6, 0.3, 0.6, 0xe0452f); topCap.position.y = 4.5; g.add(topCap);
    this.pump = box(0.2, 1.4, 0.2, 0x2e3238); this.pump.position.y = 1.4; g.add(this.pump);
    this.group.add(g);
  }
  provides(item) { return item === this.item ? 999 : 0; }
  /** At the edge of the pile, on the side the worker comes from: nobody wades into the middle of a heap. */
  standAt(zone, from) {
    const dx = from.x - zone.x, dz = from.z - zone.z, d = Math.hypot(dx, dz);
    return d > 0.01 ? { x: zone.x + dx / d * EDGE, z: zone.z + dz / d * EDGE } : { x: zone.x, z: zone.z + EDGE };
  }
  update(dt, game) {
    this.show(game.seen(this.x, this.z - 1, 7.5));
    if (this.seen) {
      if (this.pump) { this.t = (this.t || 0) + dt; this.pump.position.y = 1.4 + Math.sin(this.t * 3) * 0.5; }
      if (this.kick > 0) { this.kick = settle(this.kick, dt); const k = this.kick; this.pile.scale.set(1 + 0.04 * k, 1 - 0.1 * k, 1 + 0.04 * k); }
    }
    // Without a machine for it, the material would be stuck in the player's hands, so it stays on the ground.
    const usable = game.itemHasUse(this.item);
    if (usable !== this.usable) { this.usable = usable; this.hint.el.textContent = usable ? '' : 'Build the machine first'; }
  }
  interact(ch, dt, game) {
    if (!this.usable) return;
    ch.actionTimer -= dt;
    if (ch.actionTimer > 0) return;
    if (ch.carry.take(this.item, ch.capacityIn(game.econ))) {
      ch.actionTimer = PICK_RATE; ch.bounce(); game.onPickup(ch);
      this.kick = 1;
      if (game.near(this.x, this.z)) {   // a few chips fly off, between the pile and whoever took from it
        game.particles.emit({ x: (this.x + ch.pos.x) / 2, y: 0.5, z: (this.z + ch.pos.z) / 2 },
          { count: 2, color: ITEMS[this.item].mesh?.color ?? 0xffffff, speed: 1.6, up: 2.6, life: 0.4, size: 0.1 });
      }
    }
  }
}

// ------------------------------------------------------------- processors
const LAMP = { run: 0x39e36a, wait: 0xffc233, full: 0xff5a52 };   // working, waiting for material, no room for more
const PALLET_Y = 0.555;                            // the top of the belt: where the pallets stand
const PAD_FROM = { x: 0, y: 1.9, z: FRONT };       // onto the input pad: from the hands of whoever stands in front of it
const OUT_FROM = { x: -1.4, y: 0.7, z: -1.5 };   // onto the output pad: out of the machine

export class ProcessorStation extends Station {
  constructor(game, area, cfg) {
    super(game, area, cfg);
    this.recipeId = cfg.recipe;
    this.recipe = RECIPES[cfg.recipe];
    this.sim = new Processor(this.recipe, TUNING.processor);
    this.machine = new THREE.Group(); this.group.add(this.machine);   // the machine alone, so that it can shake without the pads and piles
    const location = AREAS.find(a => a.id === area)?.location || 'town';
    const built = buildMachine(this.machine, this.recipe, machineTraits(this.recipe, ITEMS, location));
    this.animate = built.animate;
    this.chimneys = built.chimneys; this.smokeIn = 0;   // where it smokes while it works
    this.t = 0;
    this.power = 0;    // 0 = off, 1 = running: it runs up and coasts down
    this.kick = 0;     // the thump when a batch comes out
    this.fx = built.fx; this.fxIn = 0;
    this.idle = 0;                                                    // seconds without a batch running
    this.inCity = location !== 'town';   // machines outside Lumber Town say what they are waiting for
    const under = softShadow(8.8, 6.8); under.position.set(0, 0.016, 0.9); this.group.add(under);   // the ground is darker around its foot
    // safety paint on the floor around the machine and its belt: where the work happens, and where nobody walks through
    for (const [len, x, z, turn, rx] of [[7.6, 0, -1.85, 0, 10], [7.6, 0, 3.35, 0, 10], [5.36, -3.72, 0.75, 1, 7], [5.36, 3.72, 0.75, 1, 7]]) {
      const strip = box(len, 0.02, 0.2, 0xffffff, { ...stripes(rx) }); strip.position.set(x, 0.022, z); strip.rotation.y = turn * Math.PI / 2;
      strip.castShadow = false; this.group.add(strip);
    }
    const paint = lookOf(AREAS.find(a => a.id === area)).belt;   // the belt in the colours of the yard's location
    const belt = box(6.4, 0.5, 1.8, paint.frame, { roughness: 0.45, metalness: 0.45, round: 0.1 }); belt.position.set(0, 0.25, 2.1); this.group.add(belt);
    this.beltTex = beltTexture(paint);
    const beltTop = box(6.2, 0.06, 1.6, 0xffffff, { map: this.beltTex }); beltTop.position.set(0, 0.52, 2.1); this.group.add(beltTop);
    const pole = cyl(0.06, 0.08, 2.3, 0x4a4f57, 6); pole.position.set(3.3, 1.15, -0.7); this.group.add(pole);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: LAMP.wait, toneMapped: false }));
    this.lamp.position.set(3.3, 2.4, -0.7); this.group.add(this.lamp); this.lampState = 'wait';
    const x = cfg.x, z = cfg.z;
    this.input = new Zone(x - PZ.dx, z + PZ.dz, PZ.radius, 'give', this, REACH);
    this.output = new Zone(x + PZ.dx, z + PZ.dz, PZ.radius, 'take', this, REACH);
    this.zones = [this.input, this.output];
    const inPad = dashedPad(2.4, 2.0); inPad.position.set(-2.4, 0.56, 2.1); this.group.add(inPad);
    const outPad = dashedPad(2.4, 2.0); outPad.position.set(2.4, 0.56, 2.1); this.group.add(outPad);
    // A machine with two materials shows two smaller piles on its input pad.
    // Every stack stands on a pallet, on the belt.
    const two = !!this.recipe.input2;
    const onPallet = (stack, px, wide) => { stack.group.position.set(px, PALLET_Y + addPallet(game.scene, x + px, PALLET_Y, z + 2.1, wide, wide < 1.2 ? 1.3 : 1.5) + 0.005, 2.1); return stack; };
    this.inStack = onPallet(new Stack(this.group, { spread: two ? 0.5 : 0.95, from: PAD_FROM }), two ? -2.95 : -2.4, two ? 1.04 : 1.5);
    this.inStack2 = two ? onPallet(new Stack(this.group, { spread: 0.5, from: PAD_FROM }), -1.85, 1.04) : null;
    this.outStack = onPallet(new Stack(this.group, { spread: 0.95, from: OUT_FROM }), 2.4, 1.5);
    addLightPool(game.scene, x, z + 2.6, 9);   // after dark every machine stands in light of its own, so one can be told from the next
    moving(this.machine, this.lamp, this.inStack.group, this.inStack2?.group, this.outStack.group);
    bake(this.machine); bake(this.group);   // the machine shakes as one, apart from its belt, pads and lamp
    this.statusLabel = game.labels.add('machine', '', () => ({ x: x - 2.4, y: 1.5, z: z + 2.2 }));
    // the name floats just over the machine's highest part (models differ in height), toward its back, clear of the belt
    const top = Math.max(2.6, new THREE.Box3().setFromObject(this.machine).max.y + 0.45), at = { x, y: top, z: z - 0.6 };
    this.nameLabel = game.labels.add('station-name', this.recipe.name, () => at);
  }
  provides(item) { return item === this.recipe.output ? this.sim.outputs : 0; }
  accepts(item) { return this.sim.roomFor(item); }
  wants(item) { return this.sim.uses(item); }
  zoneFor(mode) { return mode === 'give' ? this.input : this.output; }
  /** In front of the belt, facing the pad: the pads lie on the belt, and nobody stands on a conveyor. */
  standAt(zone) { return { x: zone.x, z: zone.z + FRONT }; }
  interact(ch, dt, game, zone) {
    ch.actionTimer -= dt;
    if (ch.actionTimer > 0) return;
    const cap = ch.capacityIn(game.econ);
    // Workers stop at the cap. The player never does: full hands with nowhere to unload is a dead end.
    const force = !ch.isWorker;
    const item = ch.carry.type;
    if (zone.kind === 'give' && this.sim.uses(item) && (force || this.sim.roomFor(item) > 0)) {
      if (ch.carry.drop(item)) { this.sim.put(item, force); ch.actionTimer = DROP_RATE; game.onDrop(ch); }
    } else if (zone.kind === 'take' && this.sim.outputs > 0 && ch.carry.canTake(this.recipe.output, cap)) {
      if (this.sim.takeOutput()) { ch.carry.take(this.recipe.output, cap); ch.actionTimer = PICK_RATE; ch.bounce(); game.onPickup(ch); }
    }
  }
  update(dt, game) {
    const batches = this.sim.step(dt, game.econ.speed(this.recipeId));
    if (batches > 0) { game.onBatch(this, batches); this.kick = 1; }
    this.power += ((this.sim.busy ? 1 : 0) - this.power) * Math.min(1, dt * 4);   // kept up even out of sight: the hum of the yard follows it
    this.idle = this.sim.busy ? 0 : this.idle + dt;
    // Out of the camera's sight only the rules above run. The belt, the blades, the dust, the stacks and
    // the label are left alone until the machine is looked at again; then the stacks are caught up at once.
    const back = this.show(game.seen(this.x, this.z + 1, 8.5)) && this.seen;
    if (!this.seen) return;
    this.work(dt, game);
    this.inStack.set(this.recipe.input, this.sim.inputs, back); this.inStack.animate(dt);
    if (this.inStack2) { this.inStack2.set(this.recipe.input2, this.sim.inputs2, back); this.inStack2.animate(dt); }
    this.outStack.set(this.recipe.output, this.sim.outputs, back); this.outStack.animate(dt);
    // City machines get their materials from far away, so they say which one they are waiting for:
    // at once when they already hold the other one, otherwise after standing still for a while.
    const holdsOne = this.inStack2 && this.sim.inputs + this.sim.inputs2 > 0;
    const waiting = this.inCity && !this.sim.busy && (holdsOne || this.idle > 6) ? this.sim.missing : null;
    const status = waiting ? 'NEEDS ' + ITEMS[waiting].label.toUpperCase() : this.sim.inputFull && (!this.inStack2 || this.sim.input2Full) ? 'FULL' : '';
    if (status !== this.status) { this.status = status; this.statusLabel.el.textContent = status; }
  }
  /** What shows that the machine is running: it runs up and down, hums, moves its belt, throws dust, and thumps on a batch. */
  work(dt, game) {
    const busy = this.sim.busy;
    if (this.power > 0.02) {
      const w = dt * this.power;
      this.t += w; this.animate(this.t, w, this.power);
      this.beltTex.offset.x -= w * 0.8;
      this.running = true;
    } else if (this.running) { this.running = false; this.power = 0; this.animate(this.t, 0, 0); }
    this.kick = settle(this.kick, dt, 6);
    const k = this.kick, hum = this.running ? Math.sin(this.t * 38) * 0.012 * this.power : 0;
    this.machine.position.y = hum;
    this.machine.scale.set(1 + 0.03 * k, 1 - 0.05 * k, 1 + 0.03 * k);
    const lamp = busy ? 'run' : this.sim.outputFull ? 'full' : 'wait';
    if (lamp !== this.lampState) { this.lampState = lamp; this.lamp.material.color.setHex(LAMP[lamp]); }
    if (lamp === 'run') this.lamp.scale.setScalar(1 + Math.sin(this.t * 6) * 0.12);
    else if (lamp === 'full') { this.blink = (this.blink || 0) + dt; this.lamp.scale.setScalar(1.05 + Math.max(0, Math.sin(this.blink * 7)) * 0.3); }   // stopped: its output pad is full
    else this.lamp.scale.setScalar(1);
    const fx = this.fx;
    if (fx && busy && (this.fxIn -= dt) <= 0) {
      this.fxIn = fx.every;
      if (game.near(this.x, this.z, 22)) {
        const color = fx.item ? ITEMS[this.recipe.output].mesh?.color ?? 0xffffff : fx.o.color;
        game.particles.emit({ x: this.x + fx.x + (Math.random() - 0.5) * fx.wide, y: fx.y, z: this.z + fx.z }, { ...fx.o, color });
      }
    }
    // smoke rises from its chimneys for as long as it works, thinner on the low graphics level
    if (this.chimneys && busy && (this.smokeIn -= dt) <= 0) {
      this.smokeIn = 0.36 * (game.quality?.smoke ?? 1);   // thinner on the cheaper graphics levels
      if (game.near(this.x, this.z, 32)) for (const c of this.chimneys) game.particles.puff(this.x + c.x, c.y, this.z + c.z, c.smoke);
    }
  }
  dispose() { super.dispose(); this.beltTex.dispose(); this.game.labels.remove(this.statusLabel); this.game.labels.remove(this.nameLabel); }
}

// ------------------------------------------------------------------ shops
const COUNTER_TOP = 1.43;                 // the height of the counter's surface
const SLIDES = 6, COINS = 5;              // how many sliding items and coins a shop keeps for its sales
const SLIDE_TIME = 0.4, COIN_TIME = 0.5;  // seconds

export class Shop extends Station {
  constructor(game, area, cfg) {
    super(game, area, cfg);
    this.items = cfg.items;
    this.zones = [new Zone(cfg.x, cfg.z, TUNING.shopRadius, 'give', this)];
    const g = this.group;
    const under = softShadow(7, 3.8); under.position.set(0, 0.016, 2.5); g.add(under);
    const paint = lookOf(AREAS.find(a => a.id === area)).shop;   // every yard's shop has its own colours
    const counter = box(5, 1.3, 1.6, paint.counter, { ...wood({ rx: 2 }), round: 0.1 }); counter.position.set(0, 0.65, 2.3); g.add(counter);
    const counterTop = box(5.2, 0.15, 1.8, paint.top, { ...wood({ rx: 2 }), round: 0.06 }); counterTop.position.set(0, 1.35, 2.3); g.add(counterTop);
    this.till = new THREE.Group(); this.till.position.set(1.5, 1.4, 2.3); g.add(this.till);   // on the counter: it jumps on every sale
    const reg = box(1.1, 0.8, 0.9, 0x3aa7d8, { round: 0.14, fine: 2, roughness: 0.4, metalness: 0.3 }); reg.position.y = 0.4; this.till.add(reg);
    const regKeys = box(0.8, 0.1, 0.6, 0xe8f3f8); regKeys.position.set(0, 0.82, -0.05); this.till.add(regKeys);
    this.kick = 0;
    // sign board behind the counter (an awning would hide the counter from the top-down camera)
    const board = box(3.2, 1.0, 0.16, paint.board, wood({ rx: 1.5 })); board.position.set(-0.9, 2.3, 3.2); g.add(board);
    const stripe = box(3.2, 0.22, 0.18, paint.stripe); stripe.position.set(-0.9, 2.05, 3.2); g.add(stripe);
    for (const px of [-2.3, 0.5]) { const p = cyl(0.08, 0.08, 1.9, 0x8b4a24, 6); p.position.set(px, 0.95, 3.2); g.add(p); }
    // a sample of what this shop buys, on the counter
    this.sample = makeItem(this.items[0]); this.sample.position.set(-1.2, 1.45, 2.3); g.add(this.sample);
    g.add(dashedPad(3.2, 2.6));
    // a lantern on the sign and a pool of light at the counter: the shop is found after dark
    const lantern = lit(box(0.3, 0.24, 0.2, 0xfff1c2, { map: null, round: 0.04 }), 0xffd27a, 0.08); lantern.position.set(-0.9, 2.94, 3.2); g.add(lantern);
    addLightPool(game.scene, cfg.x, cfg.z + 1.4, 7.5);
    moving(this.till, this.sample); bake(g);   // the till jumps and the sample bounces on a sale
    this.slides = []; this.coins = []; this.selling = false;   // goods sliding over the counter and coins out of the till (see showSale)
    this.label = game.labels.add('zone', cfg.name.toUpperCase(), () => ({ x: cfg.x, y: 0.3, z: cfg.z - 0.3 }));
  }
  accepts(item) { return this.items.includes(item) ? 999 : 0; }
  wants(item) { return this.items.includes(item); }
  interact(ch, dt, game) {
    ch.actionTimer -= dt;
    if (ch.actionTimer > 0) return;
    const item = ch.carry.type;
    if (item && this.items.includes(item) && ch.carry.drop(item)) {
      ch.actionTimer = DROP_RATE;
      this.kick = 1;
      game.onSell(item, ch, this);
    }
  }
  /**
   * Show a sale: the item leaves the seller's hands, slides across the counter and drops out of sight
   * behind it, and a coin jumps out of the till. A few of each are kept and used again and again.
   * @param paid  false when the item went into the warehouse for a contract: it slides, but no coin comes back
   */
  showSale(item, ch, paid = true) {
    if (!this.seen) return;
    let s = this.slides.find(q => q.t >= 1 && q.item === item);
    if (!s && this.slides.length < SLIDES) { s = { mesh: makeItem(item), item, t: 1, x: 0, base: COUNTER_TOP + stackBase(item) }; this.group.add(s.mesh); this.slides.push(s); }
    if (s) { s.t = 0; s.x = Math.max(-0.15, Math.min(0.3, ch.pos.x - this.x)); s.mesh.visible = true; this.selling = true; }   // between the sample and the till
    if (!paid) return;
    let c = this.coins.find(q => q.t >= 1);
    if (!c && this.coins.length < COINS) {
      c = { mesh: cyl(0.15, 0.15, 0.04, 0xffd23f, 14, { metalness: 1, roughness: 0.25, envMapIntensity: 1 }), t: 1, spin: 0 };
      c.mesh.rotation.x = Math.PI / 2; c.mesh.castShadow = false; this.group.add(c.mesh); this.coins.push(c);
    }
    if (c) { c.t = 0; c.spin = Math.random() * 3; c.mesh.visible = true; this.selling = true; }
  }
  update(dt, game) {
    this.show(game.seen(this.x, this.z + 2, 6.5));
    if (this.kick > 0) {
      this.kick = settle(this.kick, dt, 7);
      const k = this.kick;
      this.till.scale.set(1 + 0.1 * k, 1 + 0.22 * k, 1 + 0.1 * k);
      this.sample.position.y = 1.45 + 0.25 * k;
    }
    if (!this.selling) return;
    let live = false;
    for (const s of this.slides) {
      if (s.t >= 1) continue;
      s.t = Math.min(1, s.t + dt / SLIDE_TIME);
      const k = s.t, m = s.mesh;
      if (k >= 1) { m.visible = false; continue; }
      live = true;
      // down out of the hands onto the near edge of the counter, then across it, and over the far edge
      const down = Math.min(1, k / 0.25), across = Math.max(0, (k - 0.2) / 0.8), e = 1 - Math.pow(1 - across, 2);
      m.position.set(s.x, s.base + 0.5 * (1 - down) * (1 - down), 1.25 + 0.4 * down + 1.5 * e);
      m.scale.setScalar(k > 0.8 ? Math.max(0.01, (1 - k) / 0.2) : 1);
    }
    for (const c of this.coins) {
      if (c.t >= 1) continue;
      c.t = Math.min(1, c.t + dt / COIN_TIME);
      const k = c.t, m = c.mesh;
      if (k >= 1) { m.visible = false; continue; }
      live = true;
      m.position.set(1.5 + (c.spin - 1.5) * 0.1, 2.3 + 1.5 * k * (1.35 - k), 2.3);   // up out of the till, and a little way back down
      m.rotation.z = c.spin + k * 9;                                                  // spinning, face to the camera
      m.scale.setScalar(Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.25));
    }
    this.selling = live;
  }
  dispose() { super.dispose(); this.game.labels.remove(this.label); }
}

// ------------------------------------------------------------------ plots
const RING_R = 22, RING_C = 2 * Math.PI * RING_R;

export class Plot extends Zone {
  constructor(game, area, upgrade, x, z, { gate = false } = {}) {
    super(x, z, TUNING.plotRadius, 'pay', null);
    this.station = this;
    this.game = game; this.area = area; this.upgrade = upgrade; this.gate = gate;
    this.pad = dashedPad(3.2, 3.2, gate ? 'rgba(255,210,63,0.25)' : 'rgba(0,0,0,0.18)');
    this.pad.position.set(x, 0.02, z); game.scene.add(this.pad);
    const html =
      `<div class="ring"><svg viewBox="0 0 52 52"><circle class="bg" cx="26" cy="26" r="${RING_R}"/>` +
      `<circle class="fg" cx="26" cy="26" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>` +
      `<span class="icon">${upgrade.icon}</span></div>` +
      `<div class="name">${upgrade.label}</div><div class="cost">$${fmt(upgrade.cost)}</div>`;
    this.label = game.labels.add('plot' + (gate ? ' gate' : ''), html, () => ({ x, y: 0.2, z: z - 2.2 }));
    this.label.el.querySelector('.icon').replaceChildren(icon(EFFECT_ICON[upgrade.effect?.type] || 'upgrade'));   // a drawn icon in place of the emoji
    this.ringFg = this.label.el.querySelector('.fg');
    this.costEl = this.label.el.querySelector('.cost');
    this.accum = 0;
  }
  provides() { return 0; }
  accepts() { return 0; }
  interact(ch, dt, game) {
    if (ch.isWorker) return;
    const econ = game.econ, rem = econ.remaining(this.upgrade.id);
    if (rem <= 0 || econ.cash <= 0) return;
    // pay out over roughly a second, whatever the price
    this.accum += dt * Math.max(80, Math.min(econ.cash, rem) * 2.5, this.upgrade.cost * 0.6);
    const chunk = Math.floor(this.accum);
    if (chunk < 1) return;
    this.accum -= chunk;
    const r = econ.payToward(this.upgrade.id, chunk);
    if (r.paid > 0) game.onPay(this, r);
  }
  refresh(econ) {
    const u = this.upgrade, rem = econ.remaining(u.id);
    this.ringFg.style.strokeDashoffset = RING_C * (rem / u.cost);
    this.costEl.textContent = plotTag({ remaining: rem, cost: u.cost });   // "$60 left" once a part is paid
    this.label.el.classList.toggle('affordable', econ.cash >= rem);
  }
  update() {}
  dispose() { this.game.scene.remove(this.pad); this.game.labels.remove(this.label); }
}

export function createStation(game, area, cfg) {
  switch (cfg.type) {
    case 'source': return new Source(game, area, cfg);
    case 'processor': return new ProcessorStation(game, area, cfg);
    case 'shop': return new Shop(game, area, cfg);
    default: throw new Error('unknown station type ' + cfg.type);
  }
}
