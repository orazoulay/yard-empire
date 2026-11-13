// Bootstrap + game loop.
import './errors.js';   // platform: first, so the "Something went wrong" sheet is listening while everything else starts
import * as THREE from 'three';
import { createWorld, skyLight } from './world.js';
import { setAnisotropy } from './textures.js';
import { Input } from './input.js';
import { Labels } from './labels.js';
import { Fx } from './fx.js';
import { Guide, Pulse } from './guide.js';
import { Character } from './characters.js';
import { Area, doorRect } from './area.js';
import { Hud } from './hud.js';
import { Tutorial } from './tutorial.js';
import { Economy } from './sim/economy.js';
import { Company } from './sim/company.js';
import { Headquarters } from './hq.js';
import { RANKS, MEASURES, PRESTIGE, milestoneText } from './data/company.js';
import { SITE, BUILDS } from './data/builds.js';
import { TUNING } from './data/tuning.js';
import { chooseJob, busiestMachine, playerDest } from './sim/jobs.js';
import { AREAS, ITEMS, RECIPES, BASE_CAPACITY, allUpgrades, gateGeom, reachOf } from './data/areas.js';
import { fmt } from './format.js';
import { plotProgress } from './ui-logic.js';
import { EFFECT_ICON } from './icons.js';
import { Settings } from './settings.js';
import { Sfx } from './audio.js';
import { Particles } from './particles.js';
import { Sky } from './sky.js';
import { Trucks } from './trucks.js';
import { YardLife } from './yardlife.js';
import { Site, SiteSign } from './site.js';
import { Builders } from './builders.js';
import { siteWalk, siteBlocks, siteEntrance, insideOf, groundAt, stagePart, siteSign, lotOf } from './sim/site.js';
import { ZoomControl } from './zoom.js';
import { View } from './view.js';
import { RateMeter, offlineEarnings, OFFLINE_MIN_SECONDS, OFFLINE_EFFICIENCY, OFFLINE_CAP_SECONDS } from './sim/offline.js';
import { initPwa } from './pwa.js';
import { initNative } from './native.js';
import { Account } from './account.js';
import { CLOUD } from './config.js';
import { Credits } from './credits.js';           // credits: the server's answer about this player, kept in memory only
import { bindStore } from './credits-ui.js';
import { helperChores } from './sim/helpers.js';
import { Pet } from './pets.js';
import { supabaseTransport } from './cloud.js';
import { bindAccountUi } from './account-ui.js';
import { blankSave, logKey } from './sim/sync.js';
// yard interface: what the labels, the bubble, the shortcuts and the comfort settings do; and the loading screen's steps
import { YardUi } from './yard-ui.js';
import { loading } from './loading.js';
import { YardWatch } from './sim/advice.js';   // more to do: the Advisor's minute of machine readings

const inRect = (p, r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
/** The player's local day number (days since 1970): daily and weekly goals follow it. */
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
const SOLD_KEY = 'lumber-tycoon-sold';   // stars of a sale, to celebrate after the reload
const WALK = siteWalk();                 // the ground of the building site the player may step on, and the passage to it
const BUSY_FOR = 25;                     // seconds the builders keep working after goods reached the site
const OFFER_AFTER = 7;                   // seconds from a purchase to the offer of an account: the cards about it come first
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
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

class Game {
  /** @param account {Account} decides which save slot this game uses: the guest's or a signed-in player's */
  constructor(account) {
    this.account = account;
    this.saveKey = account.saveKey;
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Bright sunlight is squeezed into what a screen can show the way a camera does it, instead of clipping to flat colour.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    setAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    // the Metropolis is built-up land too; the building site's plot is kept free of trees and of the city's buildings
    const { scene, camera, updateCamera, sun, hemi, setDetail } = createWorld(AREAS.map(a => ({ ...a.bounds, city: a.location !== 'town' })), [SITE.plot]);
    this.scene = scene; this.camera = camera; this.updateCamera = updateCamera;
    scene.environment = skyLight(this.renderer);
    this.sun = sun;
    this.sky = new Sky({ scene, renderer: this.renderer, sun, hemi });

    this.labels = new Labels(document.getElementById('labels'), camera);
    this.hud = new Hud({ logKey: logKey(this.saveKey) });   // the log behind the bell is kept beside this player's save
    this.fx = new Fx(document.getElementById('fx'), camera, this.hud.cashEl);
    this.input = new Input(this.canvas, document.getElementById('joystick'));

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.saveKey)); } catch { saved = null; }
    this.econ = new Economy({ items: ITEMS, upgrades: allUpgrades(AREAS), baseCapacity: BASE_CAPACITY, firstArea: AREAS[0].id }, saved);
    if (Object.keys(this.econ.unlocked).length) this.econ.tutorialDone = true;
    // The company (finances, contracts, research, routes, ranks) sits beside the economy and is saved inside it.
    this.company = new Company({ econ: this.econ, areas: AREAS, items: ITEMS, recipes: RECIPES }, saved?.company);
    this.econ.company = this.company;
    this.company.seedIncome(this.econ.workerRate);
    this.company.refreshGoals(today());
    this.chores = 0;   // seconds until the next once-a-second company chores
    this.shownEvent = null;   // the event the player was last told about

    // The building site's footprints are asked for while the yards are built (their worn paths go around what stands in the way), so they exist first.
    this.siteRects = []; this.sitePart = 0; this.onSite = false; this.siteBusy = 0; this.siteGiven = -1;
    // Credits (js/credits.js): owned only once the server says so in this visit. Built before the yards, which ask it for their fence.
    this.credits = new Credits(account, { offered: !!CLOUD.url });
    this.fenceKind = () => this.credits.look('fence');
    // Areas + the doors between them
    this.areas = AREAS.map((cfg, i) => new Area(this, cfg, AREAS.slice(0, i)));
    this.doors = [];
    for (const a of this.areas) {
      const g = a.cfg.gate; if (!g) continue;
      const gg = gateGeom(a.bounds, g);
      this.doors.push({
        a: a.id, b: g.next, gateId: 'gate:' + a.id, rect: doorRect(a.bounds, g),
        pa: { x: gg.x - gg.nx * 1.2, z: gg.z - gg.nz * 1.2 }, pb: { x: gg.x + gg.nx * 1.2, z: gg.z + gg.nz * 1.2 },
      });
    }
    for (const a of this.areas) this.econ.areaOpen(a.id) ? a.buildOpen() : a.buildLocked();
    // The building site (js/data/builds.js): the plot and what has been built on it, drawn as the company has it.
    this.buildSite = new Site(scene);
    this.siteSign = new SiteSign(this.labels);
    this.builders = new Builders(scene);
    this.syncSite();

    this.player = new Character(scene, { pack: true });
    this.pet = new Pet(scene);   // the Yard Dog, when the server says it is owned
    this.playerArea = this.areas[0];
    this.bubble = this.labels.add('bubble', '', () => this.player.headPos);
    this.guide = new Guide(scene);
    this.pulse = new Pulse(scene);
    this.tutorial = new Tutorial(this);

    this.settings = new Settings();
    this.sfx = new Sfx(this.settings);
    this.particles = new Particles(scene);
    this.trucks = new Trucks(this);
    // the yard itself (list C): what is only there to be looked at, the player's own zoom, and what the camera can see
    this.life = new YardLife(this, setDetail);
    this.zoom = new ZoomControl(this.canvas, this.input);
    this.view = new View(camera);
    this.lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.meter = new RateMeter(this.econ.workerRate);
    this.tweens = [];
    this.stepTimer = 0;

    this.camFocus = new THREE.Vector3();
    this.camZoom = 1; this.stillFor = 0; this.punch = 0;   // the camera moves with the player (see frame)
    this.perf = { time: 0, frames: 0, slow: false };       // how fast this device draws, for the automatic graphics level
    this.applyGraphics();
    this.reveal = null;
    this.settingsOpen = false;
    this.offlineOpen = false;
    this.objTimer = 0;
    this.saveTimer = 0;
    this._views = null;

    this.hud.bindSettings({
      settings: this.settings,
      onReset: () => {
        this.noSave = true;
        this.hud.clearLog();   // the log tells of the progress that is being erased
        // A signed-in player gets a fresh save stamped "now", so it replaces the copy on the server too.
        if (account.user) localStorage.setItem(this.saveKey, JSON.stringify(blankSave(Date.now())));
        else localStorage.removeItem(this.saveKey);
        location.reload();
      },
      onReplayTutorial: () => this.tutorial.restart(),
      onOpen: () => { this.settingsOpen = true; this.sfx.click(); },
      onClose: () => { this.settingsOpen = false; },
      onToggle: name => { this.sfx.unlock(); this.sfx.click(); this.settings.buzz(15); if (name === 'graphics') this.applyGraphics(); },
    });
    this.hud.onSkipTutorial = () => this.tutorial.finish(true);
    this.hqOpen = false;
    this.hq = new Headquarters(this);
    this.ui = new YardUi(this, new Pulse(scene));   // yard interface: needs the HUD, the settings, the sound and the Headquarters above
    this.store = bindStore(this);                      // the credit balance in the top bar, and the store behind it
    this.credits.onChange(() => this.applyLooks());
    this.watch = new YardWatch(); this.hq.showName();   // more to do: what the Advisor reads, and the company's name in the header
    this.hud.setCash(this.econ.cash, true);

    this.clock = new THREE.Clock();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    this.checkOffline();   // before the first save overwrites the last-seen time
    this.renderer.setAnimationLoop(() => this.frame());

    let sold = 0;
    try { sold = Number(sessionStorage.getItem(SOLD_KEY)) || 0; sessionStorage.removeItem(SOLD_KEY); } catch { /* private mode */ }
    if (sold) {
      this.hud.unlock({ icon: '⭐', title: `Company sold: +${sold} legacy stars`, desc: `Everything now sells for ${Math.round(this.company.legacy.stars * PRESTIGE.starBonus * 100)}% more. Time to build again.`, kicker: 'A new start' });
      setTimeout(() => { this.sfx.fanfare(); this.fx.confetti(90); }, 900);
    }
    const ready = () => this.hud.hideLoading();
    Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(ready, ready);
  }

  resize() { this.renderer.setSize(innerWidth, innerHeight, false); }
  /**
   * The graphics level from the settings: high, low, or auto, which starts high and drops to low once
   * if this device turns out to draw slowly. Low draws fewer pixels and a smaller shadow map; the game
   * plays the same.
   */
  applyGraphics() {
    const want = this.settings.graphics, low = want === 'low' || (want === 'auto' && this.perf.slow);
    if (low === this.lowGraphics) return;
    this.lowGraphics = low;
    this.life.setLow(low);   // fewer bushes, less rain, smaller bursts, no customers: at once, without a reload
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.25 : 2));
    this.resize();
    const shadow = this.sun.shadow, size = low ? 1024 : 2048;
    shadow.mapSize.set(size, size);
    if (shadow.map) { shadow.map.dispose(); shadow.map = null; }   // made again at the new size
  }
  /** Time the first seconds of play; a device that cannot hold about 40 frames a second gets the low level. */
  measure(raw) {
    const p = this.perf;
    if (p.done || raw > 0.25 || document.hidden) return;   // a pause is not slowness
    p.age = (p.age || 0) + raw;
    if (p.age < 2) return;                                 // the first moments compile and load
    p.time += raw; p.frames++;
    if (p.time < 4) return;
    p.done = true;
    if (p.time / p.frames > 1 / 40) { p.slow = true; this.applyGraphics(); }
  }
  get paused() { return this.settingsOpen || this.offlineOpen || this.account.open; }

  // --- offline earnings -----------------------------------------------------
  /** Pay for time away: on load, and whenever the loop wakes up after a long pause. */
  checkOffline() {
    if (this.offlineOpen) return;
    const now = Date.now();
    this.company.refreshGoals(today());          // a new day refills the allowance for time away
    const terms = this.company.offlineTerms();   // wages and upkeep come off; the limit is what is left of today's allowance
    const away = (now - this.econ.lastSeen) / 1000;
    const r = offlineEarnings({ rate: this.econ.workerRate, lastSeen: this.econ.lastSeen, now, ...terms });
    this.econ.lastSeen = now;   // the same absence is never paid twice
    if (r.earned < 1) return;
    this.company.useAway(r.seconds);
    this.offlineOpen = true;
    // yard interface: the sheet gets the terms of the pay as figures (how long away, the share, what is left of today) and words them itself
    this.hud.showOffline({ earned: r.earned, seconds: r.seconds, capped: r.capped, away, share: terms.share || OFFLINE_EFFICIENCY,
      afterCosts: terms.costs > 0, left: this.company.awayLeft(), allowance: this.company.awayAllowance() }, () => {
      this.offlineOpen = false;
      this.company.earn(r.earned);
      this.hud.setCash(this.econ.cash);
      this.refreshPlots();
      this.sfx.unlock(); this.sfx.collect(); this.settings.buzz([20, 40, 20]);
      for (let i = 0; i < 10; i++) setTimeout(() => this.fx.money(this.player.headPos, () => this.hud.bumpCash()), i * 45);
      this.save();
    });
  }

  // --- small animations -------------------------------------------------------
  /** Scale a freshly built object up from nothing with a little overshoot. */
  popIn(group, dur = 0.5) {
    group.scale.setScalar(0.01);
    this.tweens.push({ t: 0, dur, step: k => {
      const c1 = 1.70158, c3 = c1 + 1, e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);   // easeOutBack
      group.scale.setScalar(Math.max(0.01, e));
    } });
  }
  near(x, z, dist = 28) { return Math.hypot(x - this.camFocus.x, z - this.camFocus.z) < dist * Math.max(1, this.zoom.value); }   // zoomed out, more is near
  /** True when something r wide at (x, z) may be in the camera's sight. What is not is neither animated nor drawn (js/view.js). */
  seen(x, z, r) { return this.view.sees(x, z, r); }
  /** True for players who asked for less motion, in the game's settings (if it has the switch) or on their device. */
  get calm() { return !!this.settings.reduceMotion || this.lessMotion.matches; }

  // --- feedback hooks called by stations and areas ------------------------------
  onPickup(ch) {
    if (ch !== this.player) return;
    this.sfx.pickup(ch.carry.count); this.settings.buzz(6);
  }
  onDrop(ch) { if (ch === this.player) this.sfx.drop(); }
  onBatch(station, batches = 1) {
    this.company.batch(station.area, station.recipeId, batches);
    if (!this.near(station.x, station.z)) return;
    this.particles.emit({ x: station.x + 1.2, y: 1.9, z: station.z + 0.6 },
      { count: 5, color: ITEMS[station.recipe.output].mesh.color, speed: 2.2, up: 3.2, life: 0.55, size: 0.13 });
    const d = Math.hypot(station.x - this.player.pos.x, station.z - this.player.pos.z);
    if (d < 16) this.sfx.machine(1 - d / 16);
  }
  onBuilt(station) {
    this._blocks = null;
    this.popIn(station.group);
    this.shock(station.x, station.z + 0.9, 0xffffff, 8); this.punch = 1;   // the camera pushes in for a moment
    this.particles.emit({ x: station.x, y: 0.2, z: station.z + 1 },
      { count: 30, color: 0xffffff, speed: 7, up: 2.5, life: 0.7, size: 0.24, gravity: 4, spread: 2, ring: true });
  }
  onHired(worker) {
    this.shock(worker.pos.x, worker.pos.z, 0xfff3b0, 3.5); this.punch = 0.6;
    this.particles.emit({ x: worker.pos.x, y: 0.4, z: worker.pos.z },
      { count: 16, color: 0xfff3b0, speed: 3.5, up: 4, life: 0.6, size: 0.16, spread: 0.6 });
  }

  // --- movement rules -----------------------------------------------------
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
  /** A ring that spreads over the ground from a point: something big just happened here. */
  shock(x, z, color = 0xffffff, size = 7) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.07, z); this.scene.add(ring);
    this.tweens.push({ t: 0, dur: 0.75, step: k => {
      ring.scale.setScalar(0.5 + (1 - Math.pow(1 - k, 3)) * size); ring.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); }
    } });
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

  // --- station queries ----------------------------------------------------
  stationViews() {
    if (this._views) return this._views;
    const out = [];
    for (const a of this.areas) if (a.open) for (const s of a.stations) {
      out.push({ id: s.id, area: a.id, x: s.x, z: s.z, station: s, machine: s.type === 'processor',
        provides: i => s.provides(i), accepts: i => s.accepts(i), wants: i => s.wants(i),
        // what a machine holds: the feeder keeps it from running dry (js/sim/jobs.js, stockShort)
        ...(s.sim ? { holds: i => s.sim.holds(i), batch: i => s.sim.batchOf(i), materials: s.sim.materials } : {}) });
    }
    return (this._views = out);
  }
  area(id) { return this.areas.find(a => a.id === id); }
  /** Jobs the workers are busy with, leaving out `except`: used so nobody doubles up on a job. */
  claims(except = null) {
    const out = [];
    for (const a of this.areas) if (a.open) for (const w of a.workers) { if (w !== except && w.job) out.push(w.claim); }
    return out;
  }
  /** True once some built station can take `item`; until then sources keep it on the ground. */
  itemHasUse(item) { return this.stationViews().some(v => v.station.wants(item)); }

  // --- events -------------------------------------------------------------
  onSell(item, ch, shop) {
    // The company decides: sold for cash, or stocked in the warehouse for a running contract.
    const mine = ch === this.player, head = ch.headPos;
    const sale = this.company.sale(item, shop.area, mine), price = sale.price;
    // Pay for time away is measured at the normal price, not the market's: leaving at a high price must not pay it for hours.
    const normal = this.econ.price(item);
    shop.showSale(item, ch, !sale.stocked);   // the item slides over the counter; a coin jumps out of the till when it was paid for
    if (sale.stocked) {
      if (mine) { this.fx.sum('stored', head.clone().add(new THREE.Vector3(0.8, 0.6, 0)), 1); this.sfx.drop(); this.settings.buzz(6); }
      else this.meter.add(normal);   // what workers bring in counts toward the pay for time away, sold or stocked
      return;
    }
    this.hud.setCash(this.econ.cash);
    this.life.sold(shop);   // now and then a customer comes for what was sold
    if (mine) {
      this.fx.money(head, () => this.hud.bumpCash());
      this.fx.sum('cash', head.clone().add(new THREE.Vector3(0.8, 0.6, 0)), price);   // yard interface: sales in a row add up to one number
      this.sfx.cash(); this.settings.buzz(8);
    } else {
      this.meter.add(normal);   // only worker sales count toward offline earnings
      if (this.near(ch.pos.x, ch.pos.z)) this.fx.money(head, () => this.hud.bumpCash());
    }
    if (this.near(ch.pos.x, ch.pos.z)) {
      this.particles.emit({ x: ch.pos.x, y: 1.6, z: ch.pos.z + 1.2 }, { count: mine ? 4 : 2, color: 0xffe066, speed: 1.8, up: 4, life: 0.5, size: 0.11 });
    }
    this.refreshPlots();
  }
  onPay(plot, r) {
    this.hud.setCash(this.econ.cash);
    this.refreshPlots();
    const u = plot.upgrade;
    this.sfx.pay(1 - this.econ.remaining(u.id) / u.cost);
    if (!r.completed) return;
    const area = this.area(plot.area);
    if (u.gate) { this.sfx.gate(); this.settings.buzz([30, 50, 30, 50, 60]); }
    else { this.sfx.fanfare(); this.settings.buzz([20, 40, 30]); }
    this.particles.emit({ x: plot.x, y: 0.3, z: plot.z }, { count: 22, color: 0xffd23f, speed: 4, up: 6, life: 0.8, size: 0.16, spread: 1.5 });
    area.applyUpgrade(u, false);
    area.spawnNextPlot();
    this.hud.unlock({ symbol: EFFECT_ICON[u.effect.type], title: u.label, desc: u.desc, kicker: u.gate ? 'New area' : 'Unlocked' });
    this.fx.confetti(u.gate ? 80 : 44);
    this._views = null;
    this.company.refreshCosts(); this.company.sync();
    this.celebrate();
    this.save();
    this.offerIn = OFFER_AFTER;   // a guest who has just bought something has something to keep: the account is offered soon (accountOffer)
    if (!area.plot && this.areas.every(a => a.open && !a.plot)) {
      setTimeout(() => this.hud.unlock({ icon: '🏆', title: 'Everything built!', desc: 'You own every yard on the map', kicker: 'Tycoon' }), 3200);
    }
  }
  refreshPlots() { for (const a of this.areas) if (a.open && a.plot) a.plot.refresh(this.econ); }

  // --- the company ----------------------------------------------------------
  /** Turn what the company reports (founded, milestone, new rank, order ready) into cards, sound and confetti. */
  celebrate() {
    const events = this.company.takeEvents(), founding = events.some(e => e.type === 'founded');
    for (const e of events) {
      let card = null;
      if (founding && e.type !== 'founded') continue;   // one card for the founding, not three
      if (e.type === 'founded') {
        card = { icon: '🏢', title: 'Company founded', desc: `You are a ${RANKS[this.company.rank].name} now. Open your Headquarters at the top.`, kicker: 'New' };
        this.sfx.gate(); this.fx.confetti(80);
      } else if (e.type === 'milestone') {
        const m = e.milestone, meas = MEASURES[m.measure];
        card = { icon: meas.icon, title: milestoneText(m, fmt), desc: `+${m.xp} experience`, kicker: 'Milestone' };
      } else if (e.type === 'rank') {
        const r = RANKS[e.rank];
        card = { icon: r.icon, title: r.name, desc: 'You reached a new rank', kicker: 'Promoted' };
        this.sfx.fanfare(); this.fx.confetti(60); this.settings.buzz([30, 50, 30]); this.punch = 1;
      } else if (e.type === 'ready') {
        if (this.company.mods.autoDeliver) continue;   // the Warehouse Manager is about to deliver it
        card = { icon: '📦', title: 'Order ready', desc: `Deliver it to ${e.contract.client} in your Headquarters`, kicker: 'Contract' };
        this.sfx.collect();
      } else if (e.type === 'delivered') {
        card = { icon: '📋', title: `Delivered to ${e.contract.client}`, desc: `Your Warehouse Manager collected $${fmt(e.reward.cash)}`, kicker: 'Contract' };
        this.sfx.collect(); this.hud.setCash(this.econ.cash); this.hud.bumpCash();
      } else if (e.type === 'achievement') {
        const a = e.achievement;
        card = { icon: a.icon, title: a.name, desc: `${a.desc} · +${a.xp} experience`, kicker: 'Achievement' };
        this.sfx.fanfare(); this.fx.confetti(40);
      } else if (e.type === 'goal') {
        card = { icon: '🎯', title: e.period === 'daily' ? 'Daily goal done' : 'Weekly goal done', desc: 'Collect your reward in the Headquarters', kicker: 'Goal' };
        this.sfx.collect();
      } else if (e.type === 'site') {   // the building site (js/data/builds.js): it opened, a stage was finished, a build was finished
        card = { symbol: 'construction', title: 'The building site is open', desc: 'Build a house from what your yards make. See Construction in your Headquarters, or walk in through the opening in the store\'s east fence.', kicker: 'Building site' };
        this.sfx.gate(); this.fx.confetti(60); this.showSite(false);
      } else if (e.type === 'stage') {
        card = { symbol: 'construction', title: e.stage.done, desc: `${e.build.name}: stage ${e.index + 1} of ${e.build.stages.length} is finished`, kicker: 'Building site' };
        this.sfx.collect(); this.showSite(false);
      } else if (e.type === 'built') {
        card = { symbol: 'construction', title: `${e.build.name} is finished`, desc: `+$${fmt(e.cash)} and +${fmt(e.xp)} experience`, kicker: 'Built' };
        this.sfx.fanfare(); this.fx.confetti(120); this.settings.buzz([30, 50, 30]); this.hud.setCash(this.econ.cash); this.hud.bumpCash(); this.showSite(false);
      } else if (e.type === 'notice') card = e.card;   // more to do: hints, price alerts, rush orders, regular clients: the company words them itself
      if (!card) continue;
      this.hud.unlock(card);
      if (this.hqOpen) this.hq.toast(`${card.kicker}: ${card.title}`, e.type);   // Headquarters: the kind of event picks the icon of the line
    }
  }
  /** One truck load: a finished item leaves a machine of the making yard and lands in a machine of the using yard. */
  truck(route) {
    const out = s => s.type === 'processor' && s.recipe.output === route.item && s.sim.outputs > 0;
    const room = s => s.type === 'processor' && s.sim.roomFor(route.item) > 0;
    const from = this.area(route.from)?.stations.find(out), to = this.area(route.to)?.stations.find(room);
    if (!from || !to || !from.sim.takeOutput()) return false;
    to.sim.put(route.item);
    if (this.near(to.x, to.z)) this.particles.emit({ x: to.x - 2.6, y: 0.6, z: to.z + 2.2 }, { count: 2, color: 0x4fc3f7, speed: 1.4, up: 2.6, life: 0.45, size: 0.12 });
    return true;
  }
  onHqToggle(open) { this.hqOpen = open; this.sfx.click(); }
  /** Sell the company (Headquarters, Expansion tab): the rules reset the yards, then the world is rebuilt by a reload. */
  sellCompany() {
    const offer = this.company.sell();
    if (!offer) return false;
    this.save(); this.noSave = true;
    try { sessionStorage.setItem(SOLD_KEY, String(offer.stars)); } catch { /* private mode */ }
    location.reload();
    return true;
  }
  /** More to do: replace the game with a backup that was read and checked (js/sim/backup.js). The world is rebuilt by a reload. */
  restore(save) {
    this.noSave = true;
    try { localStorage.setItem(this.saveKey, JSON.stringify(save)); } catch { this.noSave = false; return false; }
    location.reload();
    return true;
  }
  /** Jump to an open yard (from the Expansion tab). What the player carries comes along. */
  travel(id) {
    const a = this.area(id);
    if (!a || !a.open) return false;
    const [x, z] = a.cfg.workerSpawn;
    this.player.pos.set(x + 2, 0, z + 2);
    this.playerArea = a;
    this.camFocus.set(x + 2, 0, z + 2);
    this.particles.emit({ x: x + 2, y: 0.3, z: z + 2 }, { count: 18, color: 0xffffff, speed: 4, up: 4, life: 0.6, size: 0.18, spread: 0.8 });
    return true;
  }
  /** Once a second: new goals when the date changes, and the Factory Manager's shopping. */
  /**
   * Once a second after a purchase: offer the account to a guest who has not been asked, when the cards have had
   * their say and nothing else is on the screen. The sheet decides whether there is anyone to ask (js/account-ui.js).
   */
  accountOffer() {
    if (!(this.offerIn > 0) || --this.offerIn > 0) return;
    const quiet = !this.hqOpen && !this.reveal && !this.hud.sheetOpen && !this.hud.unlockBusy && !this.tutorial.active;
    if (!quiet) { this.offerIn = 1; return; }   // look again in a second
    this.offerAccount?.();
  }
  /** The looks bought with credits, as the server and the player's picks have them: put on, or taken off. */
  applyLooks() {
    this.player.dress(this.credits.look('outfit'));
    const fence = this.credits.look('fence');
    for (const a of this.areas) if (a.open) a.setFence(fence);
  }
  /** Once a second: the helpers bought with credits press the buttons they were bought for (js/sim/helpers.js). */
  helpers() {
    for (const d of helperChores(this.company, id => this.credits.owns(id))) {
      this.afterCompanyAction(d.kind, d.result);
      this.hud.hint(d.kind === 'send' ? `Site Foreman: ${fmt(d.result)} goods sent to the building site` : `Goal Clerk: +$${fmt(d.result.cash)} collected`, 2600);
    }
  }
  companyChores() {
    this.accountOffer();
    this.helpers();
    this.company.refreshGoals(today());
    this.syncSite();   // cheap: it draws only when the picture changes: a stage finished, a build started, another twentieth of a stage arrived
    this.siteChores();
    const c = this.company, event = c.eventNow();
    if ((event?.id || '') !== this.shownEvent) {   // say so when an event starts, and once when the game opens during one
      this.shownEvent = event?.id || '';
      if (event) this.hud.unlock({ icon: event.icon, title: event.name, desc: `${event.desc} until ${event.until}`, kicker: 'Event' });
    }
    // more to do: the Advisor's reading of the machines (it keeps one every five seconds of play)
    if (this.watch.due(c.age)) this.watch.sample(c.age, this.areas.filter(a => a.open).map(a => ({ id: a.id, machines: a.stations.filter(s => s.type === 'processor').map(s => s.sim) })));
    if (!c.mods.autoBuy || !c.settings.autoBuy || this.tutorial.active || this.reveal) return;
    // He pays the same way the player does, one upgrade at a time. Opening a new yard stays the player's call.
    for (const a of this.areas) {
      const plot = a.open && a.plot;
      if (!plot || plot.upgrade.gate) continue;
      const rem = this.econ.remaining(plot.upgrade.id);
      if (rem <= 0 || this.econ.cash < rem) continue;
      const r = this.econ.payToward(plot.upgrade.id, rem);
      if (r.paid > 0) { this.onPay(plot, r); return; }
    }
  }
  /** After a button in the Headquarters: sound, confetti, a line of feedback, and a save. */
  afterCompanyAction(kind, result) {
    this.hud.setCash(this.econ.cash);
    this.refreshPlots();
    if (!result) { this.sfx.click(); return; }
    this.celebrate();   // first, so the line about the action itself is the one that stays on screen
    if (kind === 'deliver') {
      this.sfx.collect(); this.fx.confetti(60); this.settings.buzz([20, 40, 20]); this.hud.bumpCash();
      this.hq.toast(`Delivered: +$${fmt(result.cash)}, +${result.xp} experience`);
    } else if (kind === 'research') {
      this.sfx.fanfare(); this.fx.confetti(30); this.hq.toast(`Researched: ${result.name}`);
    } else if (kind === 'route') {
      this.sfx.fanfare(); this.fx.confetti(30); this.hq.toast('The trucks are rolling');
    } else if (kind === 'hire') {
      this.sfx.fanfare(); this.fx.confetti(30);
      this.hq.toast(`${this.company.team[result.id] > 1 ? 'Trained' : 'Hired'}: ${result.name}`);
    } else if (kind === 'goal') {
      this.sfx.collect(); this.fx.confetti(result.bonus ? 60 : 24); this.hud.bumpCash();
      this.hq.toast(`+$${fmt(result.cash)}, +${result.xp} experience${result.bonus ? ' with the daily bonus' : ''}`);
    } else if (kind === 'sell') {
      this.sfx.cash(); this.hq.toast(`Sold from the warehouse: +$${fmt(result)}`);
    } else if (kind === 'build') {
      this.sfx.fanfare(); this.hq.toast(`Building started: ${result.name}`);
    } else if (kind === 'send') {
      this.sfx.collect(); this.hq.toast(`Sent to the site: ${fmt(result)} goods`);
    } else this.sfx.click();
    this.save();
  }

  /**
   * Show the building site: the camera goes to the plot and comes back, the move that introduces a new yard.
   * @param fromHq  the player asked for it in the Headquarters, which closes. When the game shows the site by
   *                itself, an open Headquarters stays open and the camera stays where it is.
   */
  showSite(fromHq = true) {
    this.syncSite();   // what the camera is about to show is what the company has now
    // Shown by the game itself, the site does not take the camera from an open Headquarters, nor from a new yard that is
    // being shown: the site opens with the last gate, and the yard behind that gate is what the player has just paid for.
    // A player who stands on the site is looking at it already.
    if (fromHq) this.hq.close(); else if (this.hqOpen || this.reveal || this.onSite) return;
    const p = SITE.plot;
    // The camera always shows the same width of ground, so a wide screen shows less depth: there it pulls back further,
    // or the tower at the back of the plot would be cut off.
    const wide = innerWidth > innerHeight;
    this.reveal = { t: 0, dur: 4.2, target: { x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2 + (wide ? 2 : 0) }, zoom: wide ? 1.75 : 0.55 };
  }

  /**
   * The site as the company has it now: its picture, and the footprints nobody walks through. The stage in work is
   * drawn as far as its goods have arrived, and the front wall of a building the player stands in is drawn low.
   */
  syncSite() {
    const c = this.company, p = this.player?.pos;
    const part = c.site.at ? stagePart(c.siteNeeds()) : 0;
    const inside = p && this.onSite ? insideOf(c.site, part, p.x, p.z) : '';
    this.sitePart = part;
    if (!this.buildSite.sync(c, part, inside)) return;
    this.siteRects = c.siteOpen ? siteBlocks(c.site, part) : [];
    this._blocks = null;
  }
  /** Once a second: what the sign over the lot says, and whether the builders have something to do. */
  siteChores() {
    const c = this.company, needs = c.siteNeeds(), build = BUILDS.find(b => b.id === c.site.at);
    this.siteSign.update(siteSign({ site: c.site, needs, open: c.siteOpen, labels: Object.fromEntries(needs.map(g => [g.item, ITEMS[g.item].label])), part: this.sitePart }), this.onSite);
    const given = needs.reduce((sum, g) => sum + g.have, 0);
    if (this.siteGiven >= 0 && given > this.siteGiven) this.siteBusy = BUSY_FOR; else if (this.siteBusy > 0) this.siteBusy--;
    this.siteGiven = build ? given : -1;
    this.builders.set(build && c.siteOpen ? { lot: lotOf(build), shape: build.shape, working: this.siteBusy > 0, count: this.lowGraphics ? 1 : 2, item: needs.find(g => g.have < g.need)?.item } : null);
  }
  /** "Go to the site" in the Headquarters: the player stands just inside the plot's entrance. */
  goToSite() {
    if (!this.company.siteOpen) return false;
    const e = siteEntrance();
    this.hq.close();
    this.player.pos.set(e.x, 0, e.z);
    this.playerArea = this.area(SITE.gate.yard) || this.playerArea;
    this.camFocus.set(e.x, 0, e.z);
    this.particles.emit({ x: e.x, y: 0.3, z: e.z }, { count: 18, color: 0xffffff, speed: 4, up: 4, life: 0.6, size: 0.18, spread: 0.8 });
    return true;
  }

  /** Called when a gate is bought: build the new yard and pan the camera over it. */
  openArea(id) {
    const a = this.area(id);
    if (!a || a.open) return;
    a.buildOpen();
    this._views = null; this._blocks = null;
    this.reveal = { t: 0, dur: 3.4, target: a.center };
  }

  // --- what should the player do next -------------------------------------
  objective() {
    const p = this.player, views = this.stationViews();
    // nearest first, but anything in the yard the player is standing in beats other yards
    const here = this.playerArea.id;
    const score = o => Math.hypot(o.x - p.pos.x, o.z - p.pos.z) + (o.area === here ? 0 : 1000);
    const byDist = (a, b) => score(a) - score(b);
    if (p.carry.type) {
      const item = p.carry.type;
      // Deliver first, sell the surplus; with everything full the player may still unload on a machine.
      const dest = playerDest({ area: here, x: p.pos.x, z: p.pos.z }, views, item);
      return dest ? { mode: 'give', item, station: dest.station, zone: dest.station.zoneFor('give', item) } : null;
    }
    const plots = this.areas.filter(a => a.open && a.plot && this.econ.cash >= this.econ.remaining(a.plot.upgrade.id)).map(a => a.plot).sort(byDist);
    if (plots[0]) return { mode: 'pay', plot: plots[0], zone: plots[0] };
    // What a worker of this yard would fetch; if this yard has nothing to do (its supplier
    // next door is empty), fall back to the job of the yard before it, and so on.
    const claims = this.claims();   // the arrow does not send you after goods a worker is already fetching
    for (let i = this.areas.indexOf(this.playerArea); i >= 0; i--) {
      const area = this.areas[i];
      // fetchReach: the arrow never sends the player further than the yard next door
      const job = chooseJob({ area: area.id, fetchReach: reachOf(area.id), x: p.pos.x, z: p.pos.z, carry: p.carry }, views, area.cfg.workerJob, claims);
      if (job && job.from) return { mode: 'take', item: job.item, station: job.from.station, zone: job.from.station.zoneFor('take', job.item) };
      // Nothing to pick up right now, but a machine here is working: wait at its output rather
      // than walking off to another yard.
      if (area === this.playerArea) {
        const m = busiestMachine(views, area.id);
        if (m) return { mode: 'take', item: m.station.recipe.output, station: m.station, zone: m.station.zoneFor('take') };
      }
    }
    const src = views.find(v => v.station.type === 'source');
    return src ? { mode: 'take', item: src.station.item, station: src.station, zone: src.station.zoneFor('take') } : null;
  }
  describe(o) {
    if (!o) return { symbol: 'check', text: 'All done here' };
    if (o.mode === 'pay') return { symbol: EFFECT_ICON[o.plot.upgrade.effect.type] || 'upgrade', text: 'Buy: ' + o.plot.upgrade.label };
    const it = ITEMS[o.item];
    if (o.mode === 'take') return { symbol: 'collect', text: 'Collect ' + it.label };
    if (o.station.type === 'shop') return { symbol: 'coin', text: 'Sell the ' + it.label };
    return { symbol: 'deliver', text: `Bring ${it.label} to the ${o.station.recipe.name.toLowerCase()}` };
  }
  updateObjectiveCard(o) {
    const card = this.tutorial.active ? this.tutorial.card() : this.describe(o);
    const plot = this.playerArea.plot;
    if (plot && !this.tutorial.active) {
      const u = plot.upgrade;   // how far the money for this yard's next purchase is, as a bar and in words
      Object.assign(card, plotProgress({ label: u.label, cash: this.econ.cash, remaining: this.econ.remaining(u.id), cost: u.cost }));
    }
    this.hud.setObjective(card);
  }

  // --- loop ---------------------------------------------------------------
  interact(ch, dt) {
    for (const a of this.areas) {
      if (!a.open) continue;
      for (const s of a.stations) for (const z of s.zones) if (z.contains(ch.pos)) { s.interact(ch, dt, this, z); break; }
      if (a.plot && a.plot.contains(ch.pos)) a.plot.interact(ch, dt, this);
    }
  }

  frame() {
    const began = performance.now();
    const raw = this.clock.getDelta();
    this.measure(raw);
    if (raw > OFFLINE_MIN_SECONDS) this.checkOffline();   // the tab slept: treat the gap as time away
    const dt = Math.min(raw, 0.05);
    this._views = null;
    const frozen = this.paused || !!this.reveal || this.hqOpen;
    const v = frozen ? { x: 0, z: 0, len: 0 } : this.input.vector;
    const p = this.player;
    p.move(v.x, v.z, v.len, dt, (a, b) => this.clampPlayer(a, b));
    this.playerArea = this.areaAt(p.pos) || this.playerArea;
    this.pet.update(dt, p, this.credits.owns('dog'));
    // On the building site: the player stands on a foundation, not in it, and a building they walk into opens its front.
    const onSite = p.pos.x > SITE.gate.x && this.company.siteOpen;
    if (onSite || this.onSite) {
      this.onSite = onSite;
      p.pos.y = onSite ? groundAt(this.company.site, this.sitePart, p.pos.x, p.pos.z) : 0;
      this.syncSite();
    }

    if (!this.paused) {
      const workerSpeed = TUNING.workerSpeed * this.company.mods.workerSpeed;
      this.interact(p, dt);
      for (const a of this.areas) {
        if (!a.open) continue;
        for (const w of a.workers) { w.speed = workerSpeed; w.update(dt, this); }
        for (const s of a.stations) s.update(dt, this);
      }
      this.meter.tick(dt);
      this.company.tick(dt);
      this.company.runRoutes(dt, route => this.truck(route));
      this.trucks.update(dt);
      this.builders.update(dt);
      this.chores -= dt;
      if (this.chores <= 0) { this.chores = 1; this.companyChores(); }
      this.celebrate();
      if (this.company.founded) this.hud.setCash(this.econ.cash);   // wages and upkeep drain it all the time
    }

    // footstep dust, pop-in tweens, particles
    if (p.moving > 0.8) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.2;
        if ((this.stepCount = (this.stepCount || 0) + 1) % 2) this.sfx.step();
        this.particles.emit({ x: p.pos.x, y: 0.05, z: p.pos.z }, { count: 1, color: 0xf6f1dc, speed: 0.7, up: 1.1, life: 0.4, size: 0.16, gravity: 2.5, spread: 0.3 });
      }
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]; tw.t += dt;
      tw.step(Math.min(1, tw.t / tw.dur));
      if (tw.t >= tw.dur) this.tweens.splice(i, 1);
    }
    this.particles.update(dt);
    // what the yard sounds like: the machines near the player, and the music
    let hum = 0;
    if (!this.paused) for (const s of this.playerArea.stations) if (s.type === 'processor' && s.power > 0.05) hum = Math.max(hum, s.power * (1 - Math.hypot(s.x - p.pos.x, s.z - p.pos.z) / 16));
    this.sfx.hum(hum); this.sfx.music();
    this.sky.update(dt, this.camFocus); this.sfx.rain(this.sky.rain);
    this.life.update(dt, this.paused);

    // yard interface: the carry bubble, the labels in the yard, the income and save status, being shown the way
    this.ui.frame(dt);

    const obj = this.objective();
    this.tutorial.update(obj);
    const target = this.tutorial.active ? this.tutorial.zone(obj) : obj?.zone;
    this.guide.update(dt, target ? this.route(p.pos, this.waypoint(p.pos, target)) : null);
    this.pulse.update(dt, this.tutorial.active ? target : null);
    this.objTimer -= dt;
    if (this.objTimer <= 0) {
      this.objTimer = 0.15;
      this.updateObjectiveCard(obj);
      const i = this.areas.indexOf(this.playerArea);
      this.hud.setArea(this.onSite ? 'Building site' : this.playerArea.cfg.name, i + 1, this.areas.length);
    }

    // camera: eased follow, with a pan + zoom-out while a new area is revealed
    // The camera moves with the player: a little closer after standing a while, further and looking ahead when running.
    this.stillFor = p.moving > 0.2 ? 0 : this.stillFor + dt;
    const wantZoom = p.moving > 0.2 ? 1.05 : this.stillFor > 1.5 ? 0.93 : 1;
    this.camZoom += (wantZoom - this.camZoom) * Math.min(1, dt * 1.4);
    this.punch = Math.max(0, this.punch - dt * 2.2);   // a short push in for a big moment
    const own = this.zoom.step(dt);   // the player's own zoom, under the camera's
    let zoom = this.camZoom * own * (1 - 0.07 * this.punch * this.punch);
    const lead = 1.8 * p.moving;
    const focus = new THREE.Vector3(p.pos.x + Math.sin(p.heading) * lead, 0, p.pos.z + Math.cos(p.heading) * lead);
    if (this.reveal) {
      const r = this.reveal; r.t += dt;
      const x = r.t / r.dur, k = smooth(0, 0.25, x) * (1 - smooth(0.78, 1, x));
      focus.lerp(new THREE.Vector3(r.target.x, 0, r.target.z), k);
      zoom = this.camZoom * own + (r.zoom ?? 0.55) * k;   // how far the camera pulls back: a yard fits with 0.55, the building site asks for more on a wide screen
      if (r.t >= r.dur) this.reveal = null;
      this.camFocus.copy(focus);
    } else {
      this.camFocus.lerp(focus, 1 - Math.exp(-dt * 5));
    }
    this.updateCamera(this.camFocus, innerWidth / innerHeight, zoom);
    this.view.update();
    this.labels.update(innerWidth, innerHeight);
    this.renderer.render(this.scene, this.camera);
    this.hud.tick(dt);
    this.hq.tick(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 2) { this.saveTimer = 0; this.save(); }
    this.loopMs = (this.loopMs || 0) * 0.98 + (performance.now() - began) * 0.02;   // what a frame's work costs, smoothed: game.loopMs in the console
  }

  save() {
    if (this.noSave) return;   // set while resetting, so the unload save cannot bring the old game back
    this.econ.workerRate = this.meter.rate;
    if (!this.offlineOpen) this.econ.lastSeen = Date.now();
    try { localStorage.setItem(this.saveKey, JSON.stringify(this.econ)); } catch { /* private mode */ }
  }
}

// Find out who is playing before the game loads their save. Without a server this resolves at once as a guest.
loading.step(1);   // yard interface: the loading bar follows the real steps: files here, then the save, then the yard
const account = await new Account(CLOUD.url ? supabaseTransport(CLOUD) : undefined).boot();   // Supabase when one is configured, else this page's own server
loading.step(2);
const game = window.game = new Game(account);
account.onLeave = () => { game.save(); game.noSave = true; };
game.offerAccount = bindAccountUi(account, { onOpen: () => game.sfx.click() }).offer;
account.start();
game.credits.refresh();   // what this player has in credits: asked once the account is known, and again when the connection comes back
addEventListener('online', () => game.credits.refresh());
addEventListener('yard:sync', e => { if (e.detail?.ok && !game.credits.online) game.credits.refresh(); });
initPwa();
initNative(game);
