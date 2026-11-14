// The game loop. One frame runs the rules in even steps (step), then draws once (present); FrameClock times the
// frames, and STEP and CATCH_UP say how long a step may be and how much time one frame may catch up.
import { OFFLINE_MIN_SECONDS } from '../sim/offline.js';
import { SITE } from '../data/builds.js';
import { TUNING } from '../data/tuning.js';
import { groundAt } from '../sim/site.js';

/** Seconds between frames, read once a frame (THREE.Clock is deprecated since r183; this is all the game used of it). */
export class FrameClock {
  constructor() { this.last = performance.now(); }
  getDelta() { const now = performance.now(), d = (now - this.last) / 1000; this.last = now; return d; }
}
export const STEP = 0.05, CATCH_UP = 0.25;   // the longest step of the rules, and the most time caught up in one frame (seconds)

/** Frame, step, present, the frame measure and the pause flag, and the yard interaction of the player. */
export class LoopMethods {
  /** Count one frame for the diagnostics and, on 'auto', for the graphics level. */
  measure(gapMs, workMs) {
    this.stats.add(gapMs, workMs);
    if (this.settings.graphics !== 'auto') return;
    if (document.hidden || this.paused) { this.autoQuality.rest(); return; }   // a pause, or a sheet over a still yard, is no measure
    if (this.autoQuality.frame(gapMs, workMs)) this.applyGraphics();
  }
  get paused() { return this.settingsOpen || this.offlineOpen || this.account.open; }

  interact(ch, dt) {
    for (const a of this.areas) {
      if (!a.open) continue;
      for (const s of a.stations) for (const z of s.zones) if (z.contains(ch.pos)) { s.interact(ch, dt, this, z); break; }
      if (a.plot && a.plot.contains(ch.pos)) a.plot.interact(ch, dt, this);
    }
  }

  /**
   * One frame. The rules of the game run in even steps of at most 50 ms (step), however fast the device draws: a phone
   * that draws 20 frames a second plays at the same speed as a screen that draws 120. Up to a quarter of a second is
   * caught up at once; a longer gap is a pause (time away pays for anything past a minute). Then the picture is drawn
   * once (present), with the animation timed by the real time between frames, so it moves at the same speed everywhere.
   */
  frame() {
    const began = performance.now();
    const raw = this.clock.getDelta();
    if (raw > OFFLINE_MIN_SECONDS) this.checkOffline();   // the tab slept: treat the gap as time away
    const total = Math.min(raw, CATCH_UP), steps = Math.max(1, Math.ceil(total / STEP - 1e-6)), dt = total / steps;
    for (let i = 0; i < steps; i++) this.step(dt);
    if (!this.paused && this.company.founded) this.hud.setCash(this.econ.cash);   // wages and upkeep drain it all the time
    this.present(Math.min(raw, 0.1));
    const work = performance.now() - began;
    this.measure(raw * 1000, work);
    this.loopMs = (this.loopMs || 0) * 0.98 + work * 0.02;   // what a frame's work costs, smoothed: game.loopMs in the console
  }

  /** The rules for dt seconds: the player and the workers move and work, the machines run, the company keeps its books. */
  step(dt) {
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
    }
  }

  /** Everything that is only looked at, for dt seconds of real time: dust, effects, sky, labels, the camera, and the picture. */
  present(dt) {
    const p = this.player;
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

    this.moveCamera(dt, p);
    this.view.update();
    this.labels.update(innerWidth, innerHeight);
    // the shadow map is drawn again every frame on the richer levels, every other frame on the cheaper ones
    const sm = this.renderer.shadowMap;
    sm.autoUpdate = false; sm.needsUpdate ||= (this.shadowFrame = (this.shadowFrame || 0) + 1) % (this.quality.shadowEvery || 1) === 0;
    if (!this.renderer.lost) this.renderer.render(this.scene, this.camera);   // while a phone has taken the graphics away, the rules still run
    this.hud.tick(dt);
    this.hq.tick(dt);

    this.debug?.update(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 2) { this.saveTimer = 0; this.save(); }
  }
}
