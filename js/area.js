// An area (yard): ground, fence, gate, its stations, plots and workers.
import * as THREE from 'three';
import { bake } from './engine/bake.js';
import { box, mat, makeRoundTrees, makeTrees, randomTreesIn, soaks } from './world.js';
import { ground, wornGround } from './textures.js';
import { buildFence, gatePaint } from './fences.js';
import { lookOf } from './data/looks.js';
import { createStation, Plot } from './stations.js';
import { Worker } from './characters.js';
import { AREAS, gateGeom } from './data/areas.js';
import { addFenceLamps, dressYard, makeSignpost } from './scenery.js';
import { wayAround, wearPaths } from './sim/yard.js';
import { SITE } from './data/builds.js';
import { fenceRuns } from './sim/site.js';
import { roleFor } from './sim/jobs.js';

export const GATE_HALF = 2.2;
const SIDES = ['n', 's', 'w', 'e'];
const ACROSS = { n: 's', s: 'n', w: 'e', e: 'w' };
const SWING = 2.8;       // how far a gate leaf swings, in radians: most of the way round, to rest at a slant against the next yard's fence, clear of its posts
const ARROW = { e: 'right', w: 'left', s: 'down', n: 'up' };   // which way a gate lies, as the camera sees it

/** Door rectangle for a gate: spans the fence line, 1.6 deep on both sides. */
export function doorRect(bounds, gate) {
  const g = gateGeom(bounds, gate), t = GATE_HALF - 0.3, d = 1.6;
  return g.nx !== 0
    ? { minX: g.x - d, maxX: g.x + d, minZ: g.z - t, maxZ: g.z + t }
    : { minX: g.x - t, maxX: g.x + t, minZ: g.z - d, maxZ: g.z + d };
}

export class Area {
  /** @param earlier  configs of the areas that unlock before this one (they already drew shared fences) */
  constructor(game, cfg, earlier) {
    this.game = game; this.cfg = cfg; this.id = cfg.id; this.bounds = cfg.bounds; this.earlier = earlier;
    this.stations = []; this.workers = []; this.plot = null; this.open = false;
    this.group = new THREE.Group(); game.scene.add(this.group);
    this.forest = null; this.barrier = null;
    this.look = lookOf(cfg);   // what sets this yard apart to the eye: ground, fence, and what its workers wear
  }

  get walkRect() {
    const b = this.bounds, m = 0.8;
    return { minX: b.minX + m, maxX: b.maxX - m, minZ: b.minZ + m, maxZ: b.maxZ - m };
  }
  get center() { const b = this.bounds; return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }; }
  contains(p) { const b = this.bounds; return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ; }

  /** Locked look: a forest filling the rectangle. */
  buildLocked() {
    let seed = 0; for (const ch of this.id) seed = seed * 31 + ch.charCodeAt(0) | 0;
    const trees = randomTreesIn(this.bounds, 34, seed);
    // Away from the first yards the forest is mixed: every third tree is a broadleaf one.
    const mixed = this.earlier.length >= 2, broad = (t, i) => mixed && i % 3 === 0;
    this.forest = new THREE.Group();
    this.forest.add(makeTrees(trees.filter((t, i) => !broad(t, i))), makeRoundTrees(trees.filter(broad)));
    this.group.add(this.forest);
  }

  /** Open look: yard ground, fence, stations and everything already bought. */
  buildOpen() {
    this.open = true;
    if (this.forest) { this.group.remove(this.forest); this.forest = null; }
    const b = this.bounds;
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ),
      soaks(mat(this.cfg.ground || 0xc9d16a, { ...ground(this.look.ground, (b.maxX - b.minX) / this.look.scale, (b.maxZ - b.minZ) / this.look.scale), roughness: 0.95 })));
    yard.rotation.x = -Math.PI / 2; yard.position.set((b.minX + b.maxX) / 2, 0.01, (b.minZ + b.maxZ) / 2);
    yard.receiveShadow = true; this.group.add(yard);
    this.buildFence();
    for (const s of this.cfg.stations) this.stations.push(createStation(this.game, this.id, s));
    const econ = this.game.econ;
    for (const u of this.cfg.upgrades) if (econ.has(u.id)) this.applyUpgrade(u, true);
    if (this.cfg.gate && econ.has('gate:' + this.id)) this.openGate(false);
    this.furnish();
    this.wear();
    this.spawnNextPlot();
  }

  /** The gate that leads into this yard from an earlier one, as { side, at } on this yard's own fence, or null. */
  get wayIn() {
    const from = this.earlier.find(o => o.gate && o.gate.next === this.id);
    return from ? { side: ACROSS[from.gate.side], at: from.gate.at } : null;
  }

  /** The opening in this yard's fence that leads to the building site (js/data/builds.js, SITE.gate), or null: only the Department Store has one. */
  get siteWay() { return SITE.gate.yard === this.id ? SITE.gate : null; }

  /**
   * Things along the fence that fit the yard's trade, and the marks on its floor. What must stay clear (the gates and
   * their signposts, the lamps, the machines, the shop, the plots) is worked out with the layout, in js/sim/dressing.js.
   */
  furnish() {
    this.dressing = dressYard(this.game.scene, this.group, this.cfg, this.lampSpots);
  }

  /**
   * The ground worn dark where people walk most: from the pile to the machines, from the machines to
   * the shop, to and from the gates. Drawn once, and again when a machine is added.
   */
  wear() {
    const b = this.bounds, game = this.game, spots = { piles: [], feeds: [], goods: [], shops: [], gates: [] };
    for (const s of this.stations) {
      if (s.type === 'source') spots.piles.push({ x: s.x, z: s.z });
      else if (s.type === 'processor') { spots.feeds.push(s.standAt(s.input)); spots.goods.push(s.standAt(s.output)); }
      else if (s.type === 'shop') spots.shops.push({ x: s.x, z: s.z });
    }
    const inside = (side, at) => side === 'e' ? { x: b.maxX - 1.8, z: at } : side === 'w' ? { x: b.minX + 1.8, z: at } : side === 's' ? { x: at, z: b.maxZ - 1.8 } : { x: at, z: b.minZ + 1.8 };
    if (this.cfg.gate) spots.gates.push(inside(this.cfg.gate.side, this.cfg.gate.at));
    const wayIn = this.wayIn;
    if (wayIn) spots.gates.push(inside(wayIn.side, wayIn.at));
    // Every path goes around the machines, the way the people do. The list of footprints it asks for may have
    // been made while the yards were still being built, so it is dropped again afterwards.
    const local = p => ({ x: p.x - b.minX, z: p.z - b.minZ }), legs = [];
    for (const path of wearPaths(spots)) {
      const pts = wayAround((a, c) => game.route(a, c), path.a, path.b);
      for (let i = 1; i < pts.length; i++) legs.push({ a: local(pts[i - 1]), b: local(pts[i]), weight: path.weight });
    }
    game._blocks = null;
    if (this.worn) { this.group.remove(this.worn); this.worn.geometry.dispose(); this.worn.material.alphaMap.dispose(); this.worn.material.dispose(); }
    this.worn = wornGround(b.maxX - b.minX, b.maxZ - b.minZ, legs, [...spots.feeds, ...spots.goods, ...spots.shops].map(local));
    this.worn.position.x = (b.minX + b.maxX) / 2; this.worn.position.z = (b.minZ + b.maxZ) / 2;
    this.group.add(this.worn);
  }

  /** A side is skipped when an earlier area already fenced that shared edge. */
  sharedWithEarlier(side) {
    const b = this.bounds, eps = 0.01;
    return this.earlier.some(o => {
      const c = o.bounds;
      const xOverlap = Math.min(b.maxX, c.maxX) - Math.max(b.minX, c.minX) > eps;
      const zOverlap = Math.min(b.maxZ, c.maxZ) - Math.max(b.minZ, c.minZ) > eps;
      if (side === 'n') return Math.abs(c.maxZ - b.minZ) < eps && xOverlap;
      if (side === 's') return Math.abs(c.minZ - b.maxZ) < eps && xOverlap;
      if (side === 'w') return Math.abs(c.maxX - b.minX) < eps && zOverlap;
      return Math.abs(c.minX - b.maxX) < eps && zOverlap;
    });
  }

  buildFence() {
    const b = this.bounds, g = this.cfg.gate;
    const ends = { n: [b.minX, b.minZ, b.maxX, b.minZ], s: [b.minX, b.maxZ, b.maxX, b.maxZ], w: [b.minX, b.minZ, b.minX, b.maxZ], e: [b.maxX, b.minZ, b.maxX, b.maxZ] };
    const runs = [], drawn = [];
    const way = this.siteWay;   // the Department Store: an opening toward the building site, always open
    for (const side of SIDES) {
      if (this.sharedWithEarlier(side)) continue;
      const [x1, z1, x2, z2] = ends[side];
      drawn.push({ side, x1, z1, x2, z2 });
      runs.push(...fenceRuns([x1, z1, x2, z2], [g, way].filter(o => o && o.side === side).map(o => ({ at: o.at, half: o.half ?? GATE_HALF }))));
    }
    // rails, pickets, a wall, railings, mesh or glass: by the yard's look, or the player's Fence choice (bought with credits)
    this.fenceRuns = runs; this.fenceGroup = new THREE.Group(); this.group.add(this.fenceGroup);
    this.fenceKind = this.game.fenceKind?.() || this.look.fence;
    buildFence(this.fenceGroup, runs, this.fenceKind); bake(this.fenceGroup);   // a fence never moves: its rails and walls are joined

    this.lampSpots = addFenceLamps(this.game.scene, b, drawn, [g, way].filter(Boolean), GATE_HALF + 2.4);   // clear of the gates and of their signposts
    if (way) {   // the signpost beside the opening says where it leads
      const post = makeSignpost('Building site', ARROW[way.side]);
      post.position.set(b.maxX, 0, way.at - way.half - 1.1);
      this.group.add(post);
    }

    if (g) { // a gate of two leaves across the opening, shut until the gate is bought; wood or steel, to go with the fence
      const gg = gateGeom(b, g), bar = new THREE.Group(), H = GATE_HALF, paint = gatePaint(this.look.fence);
      const leaves = [-1, 1].map(end => {
        // a leaf hangs from the fence post at its end of the opening and reaches to the middle
        const leaf = new THREE.Group(); leaf.position.x = end * H;
        const plank1 = box(H, 0.25, 0.12, paint.plank, paint.extra); plank1.position.set(-end * H / 2, 0.45, 0); leaf.add(plank1);
        const plank2 = plank1.clone(); plank2.position.y = 0.9; leaf.add(plank2);
        const cross = box(H * 0.98, 0.18, 0.1, paint.frame, paint.extra); cross.position.set(-end * H / 2, 0.68, 0); cross.rotation.z = end * 0.2; leaf.add(cross);
        const stile = box(0.14, 1.0, 0.14, paint.frame, paint.extra); stile.position.set(-end * (H - 0.07), 0.6, 0); leaf.add(stile);
        bake(leaf); bar.add(leaf);   // each leaf swings as one piece
        return leaf;
      });
      const sign = box(1.6, 0.9, 0.1, 0xffd23f); sign.position.y = 1.7; bar.add(sign);
      bar.position.set(gg.x, 0, gg.z);
      if (gg.nx !== 0) bar.rotation.y = Math.PI / 2;
      this.group.add(bar);
      // `out`: which way, along the gate's own depth, the next yard lies. The leaves swing that way, away from whoever paid.
      this.barrier = { leaves, sign, out: gg.nx + gg.nz, open: false };

      // the signpost beside it says where the gate leads; it stands on the fence line, so nobody walks into it
      const next = AREAS.find(a => a.id === g.next), along = GATE_HALF + 1.1;
      const post = makeSignpost(next ? next.name : '', ARROW[g.side]);
      post.position.set(gg.nx !== 0 ? gg.x : gg.x - along, 0, gg.nx !== 0 ? gg.z - along : gg.z);
      this.group.add(post);
    }
  }

  /** Draw the fence again in another kind ('' for the yard's own). Only the fence: gates, lamps and signposts stay. */
  setFence(kind) {
    const want = kind || this.look.fence;
    if (!this.fenceGroup || want === this.fenceKind) return;
    for (const o of [...this.fenceGroup.children]) { this.fenceGroup.remove(o); if (!o.geometry?.userData.shared) o.geometry?.dispose(); }   // shared shapes stay for the next fence
    this.fenceKind = want;
    buildFence(this.fenceGroup, this.fenceRuns, want); bake(this.fenceGroup);
  }

  /**
   * Open the gate: the two leaves swing away into the next yard and come to rest against its fence,
   * out of everybody's way, and the yellow board comes down.
   * @param swing  true to show it happen (when the gate is bought), false to find it open (when a save is loaded)
   */
  openGate(swing) {
    const gate = this.barrier;
    if (!gate || gate.open) return;
    gate.open = true;
    const pose = k => {
      const turn = SWING * (1 - Math.pow(1 - k, 3)) * gate.out;
      gate.leaves[0].rotation.y = -turn; gate.leaves[1].rotation.y = turn;
      gate.sign.visible = k < 0.25; gate.sign.scale.setScalar(Math.max(0.01, 1 - k * 4));
    };
    if (swing && !this.game.calm) this.game.tweens.push({ t: 0, dur: 1.4, step: pose });   // players who asked for less motion find it open
    else pose(1);
  }

  spawnNextPlot() {
    if (this.plot) { this.plot.dispose(); this.plot = null; }
    const next = this.game.econ.nextUpgrade(this.id);
    if (!next) return;
    let x, z;
    if (next.gate) {
      const gg = gateGeom(this.bounds, this.cfg.gate);
      x = gg.x - gg.nx * 2.8; z = gg.z - gg.nz * 2.8;
    } else [x, z] = next.plot;
    this.plot = new Plot(this.game, this.id, next, x, z, { gate: !!next.gate });
    this.plot.refresh(this.game.econ);
  }

  applyUpgrade(u, silent) {
    const e = u.effect;
    if (e.type === 'worker') {
      const w = new Worker(this.game.scene, this.id, this.cfg.workerJob, this.workers.length + this.id.length);   // the number picks the look
      // The first worker hired keeps the yard's machines stocked, the second hauls (js/sim/jobs.js). Upgrades are applied in
      // their order, on hiring and on loading alike, so a reloaded game and an old save get the same roles.
      w.role = roleFor(this.workers.length, this.cfg.workerJob);
      const [sx, sz] = this.cfg.workerSpawn;
      w.pos.set(sx + this.workers.length * 1.5, 0, sz);
      this.workers.push(w);
      if (!silent) this.game.onHired(w);
    } else if (e.type === 'station') {
      const s = createStation(this.game, this.id, e.station);
      this.stations.push(s);
      if (!silent) { this.game.onBuilt(s); this.wear(); }   // a new machine, new ways to walk
    } else if (e.type === 'area') {
      this.openGate(!silent);
      if (!silent) this.game.openArea(e.area);
    }
  }
}
