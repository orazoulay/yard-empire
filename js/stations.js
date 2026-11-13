// 3D stations built from data: Source, ProcessorStation, Shop, Plot.
import * as THREE from 'three';
import { box, cyl, mat, METAL, GLOW } from './world.js';
import { panel, softShadow, wood } from './textures.js';
import { addPallet, itemSize, makeItem, Stack, stackBase } from './items3d.js';
import { Processor } from './sim/processor.js';
import { RECIPES, ITEMS, AREAS } from './data/areas.js';
import { fmt } from './format.js';
import { plotTag } from './ui-logic.js';
import { lookOf } from './data/looks.js';
import { icon, EFFECT_ICON } from './icons.js';
import { TUNING } from './data/tuning.js';
import { machineTraits } from './sim/yard.js';
import { blockPart, merge, solid } from './models.js';
import { addLightPool } from './scenery.js';

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
    for (let i = 0; i < (field ? 60 : 46); i++) {
      const l = makeItem(cfg.item); const r = Math.sqrt(Math.random()) * 2.9, a = Math.random() * Math.PI * 2;
      if (field) {
        l.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.85);
        l.scale.set(1.1, 1.1 + Math.random() * 0.5, 1.1);
      } else {
        const tier = Math.floor(i / 14), in_ = 1 - tier * 0.24;   // each layer is smaller than the one under it: a heap, not a cylinder
        l.position.set(Math.cos(a) * r * 0.9 * in_, 0.12 + tier * 0.28, Math.sin(a) * r * 0.75 * in_);
        l.rotation.y = Math.random() * Math.PI; l.scale.setScalar(1.2 + Math.random() * 0.5);
      }
      this.pile.add(l);
    }
    if (cfg.prop === 'mound') this.buildMound();
    if (cfg.prop === 'derrick') this.buildDerrick();
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
/** A saw blade seen from the side: one toothed disc, cut out of a single outline so that it is one mesh and not a disc plus teeth. */
const BLADE = (() => {
  const shape = new THREE.Shape(), teeth = 14, at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  for (let k = 0; k < teeth; k++) {
    const tip = k / teeth * Math.PI * 2, gullet = (k + 0.75) / teeth * Math.PI * 2;
    k ? shape.lineTo(...at(tip, 0.6)) : shape.moveTo(...at(tip, 0.6));
    shape.lineTo(...at(gullet, 0.47));
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false }).translate(0, 0, -0.035).rotateY(Math.PI / 2);   // turned to spin around x
})();

/**
 * Machine models. Each returns animate(t, dt, power), called while the machine runs and once more when
 * it has stopped. power goes from 0 (off) to 1 (running): machines run up and coast down, and t and dt
 * are already slowed by it.
 */
const LOOKS = {
  saw(g, c) {
    const body = box(6, 1.6, 2.2, c.body, { ...panel(), round: 0.14, fine: 2 }); body.position.y = 0.8; g.add(body);
    const top = box(5.6, 0.2, 2.0, c.accent, { roughness: 0.5, metalness: 0.35, round: 0.08 }); top.position.y = 1.7; g.add(top);
    const controls = box(0.6, 0.6, 0.3, 0x333a44); controls.position.set(2.6, 1.0, 1.2); g.add(controls);
    const screen = lit(box(0.42, 0.26, 0.03, 0x9ff0c0, { map: null }), 0x39e36a, 0.25); screen.position.set(2.6, 1.08, 1.36); g.add(screen);   // the controls stay readable after dark
    const blades = [];
    for (let i = -1; i <= 1; i++) {
      // a plain disc looks the same at every angle: the teeth and the hub bolt are what show that it turns
      const b = new THREE.Group(); b.position.set(i * 1.4, 1.75, 0);
      const disc = new THREE.Mesh(BLADE, mat(0xe3e6e8, METAL)); disc.castShadow = true; b.add(disc);
      const hub = cyl(0.16, 0.16, 0.14, 0xd63a2f, 8); hub.rotation.z = Math.PI / 2; b.add(hub);
      const bolt = box(0.16, 0.08, 0.08, 0x3a2a1c); bolt.position.set(0, 0.09, 0); bolt.castShadow = false; b.add(bolt);
      const slot = box(0.3, 0.04, 1.5, 0x5e1712); slot.position.set(i * 1.4, 1.81, 0); slot.castShadow = false; g.add(slot);   // the slit the blade runs in
      g.add(b); blades.push(b);
    }
    return (t, dt) => { for (const b of blades) b.rotation.x += dt * 18; };
  },
  house(g, c) {
    const body = box(6, 2.2, 2.2, c.body, { ...panel(), round: 0.12, fine: 2 }); body.position.y = 1.1; g.add(body);
    const roof = box(6.6, 0.3, 2.8, c.accent); roof.position.y = 2.35; g.add(roof);
    const door = box(1.2, 1.5, 0.1, 0x7a4e24, wood({ upright: true })); door.position.set(0, 0.75, 1.12); g.add(door);
    const win1 = box(0.9, 0.7, 0.1, 0xbfe6ff, { map: null, roughness: 0.06, metalness: 0.4, envMapIntensity: 1 }); win1.position.set(-1.9, 1.4, 1.12); g.add(win1);
    win1.material.emissive.setHex(0xffd27a); win1.material.emissiveIntensity = 0; GLOW.push(win1.material);   // lit from inside after dark
    const win2 = win1.clone(); win2.position.x = 1.9; g.add(win2);
    const hammer = new THREE.Group(); hammer.position.set(0, 2.6, 0);
    const handle = box(0.12, 0.9, 0.12, 0x8b5a2b); handle.position.y = 0.45; hammer.add(handle);
    const head = box(0.5, 0.25, 0.25, 0x8a8f96, { ...METAL, map: null }); head.position.y = 0.95; hammer.add(head);
    g.add(hammer);
    return t => { hammer.rotation.x = -0.6 + Math.abs(Math.sin(t * 9)) * 0.9; };
  },
  furnace(g, c) {
    const body = box(6, 1.9, 2.2, c.body, { ...panel(), round: 0.2, fine: 2 }); body.position.y = 0.95; g.add(body);
    const cap = box(6.3, 0.25, 2.5, c.accent); cap.position.y = 2.0; g.add(cap);
    const chimney = cyl(0.45, 0.55, 2.0, c.accent, 10); chimney.position.set(-1.9, 3.0, -0.2); g.add(chimney);
    const mouth = box(1.8, 0.9, 0.12, 0x1c1a19); mouth.position.set(0.6, 0.85, 1.12); g.add(mouth);
    const fire = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xff8a1f }));
    fire.position.set(0.6, 0.8, 1.19); g.add(fire);
    smokes(g, -1.9, 4.2, -0.2, { size: 0.55 });   // the smoke itself is made of particles: see work() below
    return (t, dt, power = 1) => {
      if (power < 0.1) { fire.scale.y = 0.35; fire.material.color.setHex(0xa8501a); return; }   // embers
      fire.scale.y = 0.7 + Math.abs(Math.sin(t * 11)) * 0.5;
      fire.material.color.setHex(Math.sin(t * 17) > 0 ? 0xff8a1f : 0xffc247);
    };
  },
  mill(g, c) {
    const base = box(6, 0.9, 2.2, 0xb07a45, wood({ rx: 3 })); base.position.y = 0.45; g.add(base);
    const tower = cyl(1.0, 1.35, 3.0, c.body, 8); tower.position.set(0, 2.4, 0); g.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.1, 8), mat(c.accent)); roof.position.set(0, 4.45, 0); roof.castShadow = true; g.add(roof);
    const pane = lit(box(0.42, 0.55, 0.08, 0xbfe6ff, { map: null, roughness: 0.06, metalness: 0.4, envMapIntensity: 1 }), 0xffd27a, 0); pane.position.set(0, 1.9, 1.2); g.add(pane);   // a window in the tower, lit after dark
    const hub = new THREE.Group(); hub.position.set(0, 3.2, 1.15); g.add(hub);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
      const blade = box(0.5, 2.0, 0.06, 0xfaf3df); blade.position.y = 1.15; arm.add(blade);
      const spar = box(0.1, 2.3, 0.08, 0x8b5a2b); spar.position.y = 1.15; arm.add(spar);
      hub.add(arm);
    }
    return (t, dt) => { hub.rotation.z -= dt * 2.6; };
  },
  tank(g, c) {
    const base = box(6, 0.5, 2.2, 0x5c6670, { ...panel(), round: 0.1 }); base.position.y = 0.25; g.add(base);
    for (const px of [-1.7, 1.2]) {
      const tank = cyl(1.05, 1.05, 2.6, c.body, 20, { metalness: 0.65, roughness: 0.3, envMapIntensity: 0.8 }); tank.position.set(px, 1.8, 0); g.add(tank);
      const band = cyl(1.08, 1.08, 0.3, c.accent, 14); band.position.set(px, 2.3, 0); g.add(band);
      const lid = cyl(0.7, 1.05, 0.3, c.body, 20, { metalness: 0.65, roughness: 0.3, envMapIntensity: 0.8 }); lid.position.set(px, 3.25, 0); g.add(lid);
    }
    const pipe = box(2.2, 0.22, 0.22, c.accent); pipe.position.set(-0.25, 1.2, 0.9); g.add(pipe);
    const stack = cyl(0.16, 0.16, 2.2, 0x6a7078, 10, METAL); stack.position.set(2.6, 1.6, -0.5); g.add(stack);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xff8a1f }));
    flame.position.set(2.6, 3.0, -0.5); flame.visible = false; g.add(flame);
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 12), mat(0xe0452f)); valve.position.set(-0.25, 1.2, 1.1); g.add(valve);
    const gauge = lit(box(0.5, 0.2, 0.03, 0xd8f4ff, { map: null }), 0x7fd6ff, 0.2); gauge.position.set(-2.4, 0.27, 1.12); g.add(gauge);   // a lit panel on the base
    return (t, dt, power = 1) => { valve.rotation.z += dt * 5; flame.visible = power > 0.1; flame.scale.y = 0.8 + Math.abs(Math.sin(t * 13)) * 0.6; };
  },
};

/** Make a mesh glow after dark (see GLOW in js/world.js). byDay: how much of the glow is there in daylight. */
function lit(mesh, glow, byDay) {
  const m = mesh.material;
  m.emissive.setHex(glow); m.emissiveIntensity = byDay; m.userData.byDay = byDay; GLOW.push(m);
  mesh.castShadow = false;
  return mesh;
}
/** Note a place on a machine that smokes while it works, in the machine's own space. */
function smokes(g, x, y, z, smoke = {}) { (g.userData.chimneys ||= []).push({ x, y, z, smoke }); }

// Where the extras of each model go. top: the height of its roof or deck. Pairs are [x, z] on that roof.
// side: the height at which a second feed enters. neon: the height of the lit strip on the front (z = 1.1).
const FIT = {
  saw:     { top: 1.8,  hopper: [-2.55, -0.4],  stack: [2.55, -0.75], vent: [2.2, -0.6],   side: 1.1, neon: 1.5 },
  house:   { top: 2.5,  hopper: [-2.2, -0.4],   stack: [1.9, -0.55],  vent: [1.9, -0.5],   side: 1.2, neon: 2.08 },
  furnace: { top: 2.12, hopper: [2.3, -0.2],    stack: [-0.7, -0.55], vent: [0.8, -0.5],   side: 1.2, neon: 1.78 },
  mill:    { top: 0.9,  hopper: [-2.3, -0.3],   stack: [2.4, -0.5],   vent: [2.3, 0.4],    side: 0.6, neon: 0.74 },
  tank:    { top: 0.5,  hopper: [-0.25, -0.3],  stack: [-0.25, -0.85], vent: [2.65, 0.55], side: 1.2, neon: 0.36 },
};
const BRASS = { metalness: 0.95, roughness: 0.28, envMapIntensity: 0.9, map: null };
const bright = hex => (0.299 * (hex >> 16 & 255) + 0.587 * (hex >> 8 & 255) + 0.114 * (hex & 255)) / 255;

/**
 * What sets this machine apart from the others built on the same model (see machineTraits in
 * js/sim/yard.js): a sign with its product, a hopper for loose material, a second feed, a lit strip,
 * and a trim that follows what the product is made of.
 */
function dress(g, look, recipe, traits) {
  const fit = FIT[look], c = recipe.colors, top = fit.top;

  // The sign: a board in the product's colour, high at the back corner, with the product itself on it.
  const sign = new THREE.Group(); sign.position.set(-3.45, 0, -0.7); g.add(sign);
  const post = cyl(0.055, 0.07, 2.7, 0x4a4f57, 6); post.position.y = 1.35; sign.add(post);
  const board = new THREE.Group(); board.position.set(0.45, 3.0, 0.06); board.rotation.x = -0.45; sign.add(board);   // leaning back, to face the camera above
  const back = box(0.98, 0.78, 0.07, traits.sign, { round: 0.03 }); board.add(back);
  // a panel behind the product, not a disc: a pale bar on a dark disc reads as a "no entry" sign
  const disc = box(0.84, 0.62, 0.03, bright(traits.sign) > 0.55 ? 0x2b3037 : 0xf4ecd8, { round: 0.012, map: null }); disc.position.z = 0.045; disc.castShadow = false; board.add(disc);
  const out = recipe.output, shape = ITEMS[out].mesh, sample = makeItem(out), size = 0.5 / itemSize(out);
  sample.scale.setScalar(size);
  // flat things are shown from above, the way they lie on a pad; things that stand are shown standing
  const lying = shape.shape === 'torus' || shape.shape === 'hammer' || (shape.shape === 'box' && shape.size[1] < 0.9 * Math.min(shape.size[0], shape.size[2]));
  if (lying) { sample.rotation.x = Math.PI / 2; sample.position.set(shape.shape === 'hammer' ? -0.03 : 0, 0, 0.07 + stackBase(out) * size); }
  else { sample.rotation.x = 0.45; sample.position.set(0, -0.2 + stackBase(out) * size, 0.14); }
  board.add(sample);

  if (traits.hopper != null) {   // loose material is tipped in from above
    const [x, z] = fit.hopper;
    const neck = box(0.36, 0.24, 0.36, 0x5c6670); neck.position.set(x, top + 0.12, z); g.add(neck);
    const funnel = cyl(0.7, 0.22, 0.62, 0x6f7780, 4, { metalness: 0.5, roughness: 0.5 }); funnel.rotation.y = Math.PI / 4; funnel.position.set(x, top + 0.53, z); g.add(funnel);
    const heap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), mat(traits.hopper, { flatShading: true, roughness: 0.95 }));
    heap.scale.set(1, 0.45, 1); heap.position.set(x, top + 0.82, z); heap.castShadow = true; g.add(heap);
  }

  if (traits.twin != null) {   // a second material has a feed of its own, at the end where the materials arrive
    const bin = box(0.5, 0.9, 1.0, 0x5c6670, { ...panel(), round: 0.06 }); bin.position.set(-3.2, 0.45, 0.15); g.add(bin);
    const lid = box(0.54, 0.12, 1.04, traits.twin, { round: 0.04 }); lid.position.set(-3.2, 0.96, 0.15); g.add(lid);
    const chute = box(0.5, 0.14, 0.3, 0x4a4f57); chute.position.set(-3.0, fit.side, 0.15); g.add(chute);
  }

  if (traits.neon) {   // the Metropolis is lit: a strip in the machine's colour along its front
    const strip = lit(box(5.5, 0.09, 0.06, c.accent, { map: null }), c.accent, 0.35); strip.position.set(0, fit.neon, 1.14); g.add(strip);
  }

  const trim = traits.trim;
  if (trim === 'chimney') {   // metal is made hot
    const [x, z] = fit.stack;
    if (look === 'house') {
      const h = 1.15, bricks = box(0.55, h, 0.55, 0x9a4a32, { round: 0.03 }); bricks.position.set(x, top + h / 2 - 0.05, z); g.add(bricks);
      const cap = box(0.68, 0.1, 0.68, 0x3a3f46); cap.position.set(x, top + h, z); g.add(cap);
      smokes(g, x, top + h + 0.3, z, { size: 0.42 });
    } else {
      const r = look === 'furnace' ? 0.3 : look === 'saw' ? 0.11 : 0.2, h = look === 'tank' ? 2.9 : 1.5;
      const pipe = cyl(r, r * 1.15, h, look === 'furnace' ? c.accent : 0x6a7078, 10, look === 'furnace' ? {} : METAL); pipe.position.set(x, top + h / 2, z); g.add(pipe);
      const ring = cyl(r * 1.25, r * 1.25, 0.14, 0x2c2f35, 10); ring.position.set(x, top + h - 0.07, z); g.add(ring);
      smokes(g, x, top + h + 0.25, z, { size: r < 0.15 ? 0.3 : 0.45, color: r < 0.15 ? 0x9a9fa6 : 0xdcdcdc });
    }
  } else if (trim === 'fine') {   // gold, gems and glass are shown off
    if (look === 'house') {
      // a striped awning over the door, and a gilded edge to the roof
      const strips = [-0.84, -0.42, 0, 0.42, 0.84].map((x, i) => blockPart(0.42, 0.07, 0.85, i % 2 ? 0xfaf3df : c.accent, [x, 0, 0]));
      const awning = new THREE.Mesh(merge(strips), solid()); awning.position.set(0, 1.84, 1.5); awning.rotation.x = 0.4; awning.castShadow = true; g.add(awning);
      const edge = box(6.62, 0.09, 0.09, 0xe8c66a, BRASS); edge.position.set(0, 2.24, 1.42); g.add(edge);
    } else if (look === 'saw') {
      // the blades run under glass
      const guard = box(4.5, 0.8, 1.7, 0xbfe6ff, { map: null, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, envMapIntensity: 1, depthWrite: false });
      guard.position.set(0, 2.22, 0); guard.castShadow = false; g.add(guard);
      const frame = box(4.6, 0.06, 1.8, 0xe8c66a, BRASS); frame.position.set(0, 2.65, 0); g.add(frame);
    } else {
      // a brass band around the body, and on a furnace a glowing port to watch the melt through
      const band = box(6.08, 0.12, 2.28, 0xe8c66a, BRASS); band.position.set(0, look === 'furnace' ? 1.55 : top - 0.12, 0); g.add(band);
      if (look === 'furnace') {
        const port = lit(cyl(0.3, 0.3, 0.08, 0xffc98a, 14), 0xff8a1f, 0.6); port.rotation.x = Math.PI / 2; port.position.set(-1.7, 1.05, 1.14); g.add(port);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 6, 16), mat(0xe8c66a, BRASS)); rim.position.set(-1.7, 1.05, 1.17); g.add(rim);
      }
    }
  } else if (trim === 'drums') {   // what comes in barrels is filled into them here
    const [x, z] = fit.vent;
    for (const dz of [-0.24, 0.26]) { const d = makeItem(out); d.position.set(x, top, z + dz); g.add(d); }
    const arm = box(0.9, 0.08, 0.08, c.accent); arm.position.set(x - 0.35, top + 0.8, z); g.add(arm);
    const spout = box(0.08, 0.22, 0.08, c.accent); spout.position.set(x, top + 0.69, z); g.add(spout);
  } else if (trim === 'vent') {   // plastics and electronics want clean air: a fan unit, and an aerial with a light
    const [x, z] = fit.vent;
    const unit = box(0.8, 0.42, 0.7, 0xd9dde2, { round: 0.05 }); unit.position.set(x, top + 0.21, z); g.add(unit);
    const grille = box(0.56, 0.22, 0.03, 0x2b3037); grille.position.set(x, top + 0.22, z + 0.36); grille.castShadow = false; g.add(grille);
    const aerial = cyl(0.02, 0.02, 1.1, 0x4a4f57, 5); aerial.position.set(x + 0.28, top + 0.97, z - 0.22); g.add(aerial);
    const beacon = lit(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xff5a52)), 0xff2a1f, 0.4); beacon.position.set(x + 0.28, top + 1.55, z - 0.22); g.add(beacon);
  }
}

/** What flies off a machine while it works: where (in the machine's own space), how often, and what it looks like. */
const WORK_FX = {
  saw: { every: 0.12, x: 0, wide: 3.2, y: 1.95, z: 0, item: true, o: { count: 1, speed: 1.5, up: 2.6, life: 0.5, size: 0.09, spread: 0.2 } },          // sawdust
  house: { every: 0.3, x: 0, wide: 0.4, y: 3.3, z: 0, item: true, o: { count: 1, speed: 1.2, up: 2.2, life: 0.5, size: 0.1, spread: 0.2 } },           // chips under the hammer
  mill: { every: 0.28, x: 0, wide: 1.6, y: 1.2, z: 1.2, o: { count: 1, color: 0xfaf3df, speed: 0.6, up: 1.4, life: 0.8, size: 0.1, gravity: 2 } },     // flour
  furnace: { every: 0.22, x: 0.6, wide: 1.2, y: 0.9, z: 1.3, o: { count: 1, color: 0xffb347, speed: 1.2, up: 2.8, life: 0.45, size: 0.07, gravity: 6 } },   // sparks
};
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
    const look = LOOKS[this.recipe.look] ? this.recipe.look : 'house', location = AREAS.find(a => a.id === area)?.location || 'town';
    this.animate = LOOKS[look](this.machine, this.recipe.colors);
    dress(this.machine, look, this.recipe, machineTraits(this.recipe, ITEMS, location));
    this.chimneys = this.machine.userData.chimneys || null; this.smokeIn = 0;   // where it smokes while it works
    this.t = 0;
    this.power = 0;    // 0 = off, 1 = running: it runs up and coasts down
    this.kick = 0;     // the thump when a batch comes out
    this.fx = WORK_FX[this.recipe.look] || null; this.fxIn = 0;
    this.idle = 0;                                                    // seconds without a batch running
    this.inCity = location !== 'town';   // machines outside Lumber Town say what they are waiting for
    const under = softShadow(8.8, 6.8); under.position.set(0, 0.016, 0.9); this.group.add(under);   // the ground is darker around its foot
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
    this.statusLabel = game.labels.add('machine', '', () => ({ x: x - 2.4, y: 1.5, z: z + 2.2 }));
    this.nameLabel = game.labels.add('station-name', this.recipe.name, () => ({ x, y: 2.6, z }));
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
      this.smokeIn = game.lowGraphics ? 0.9 : 0.36;
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
