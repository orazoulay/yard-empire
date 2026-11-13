// The time of day and the weather: the sun crosses the sky and sets, night falls and lifts, cloud
// shadows drift over the ground, and now and then a shower passes. None of it changes the game's
// rules; it only changes the light.
import * as THREE from 'three';
import { GLOW, LIGHT, WET, sunAt, wind } from './world.js';
import { cloudShadow } from './textures.js';
import { Storm, wetness } from './sim/yard.js';

const DAY = 540;          // seconds for a whole day and night
const SHOWER = [45, 75];  // a shower lasts between these many seconds
const DRY = [300, 600];   // and the sky stays dry between these many
const DROPS = 640, AREA = 46, CEILING = 22;
const LOW_DROPS = 150;    // streaks on the low graphics level: enough to see that it rains

const C = hex => new THREE.Color(hex);
const SUN_DAY = C(0xfff0d0), SUN_LOW = C(0xff9c52), MOON = C(0x8fa8ff);
const SKY_DAY = C(0xdcecff), SKY_NIGHT = C(0x5a74c0);
const AIR_DAY = C(0x8fcf5a), AIR_NIGHT = C(0x2f5a44), AIR_FLASH = C(0xdfe8ff);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const between = ([a, b]) => a + Math.random() * (b - a);

export class Sky {
  constructor({ scene, renderer, sun, hemi }) {
    this.scene = scene; this.renderer = renderer; this.sun = sun; this.hemi = hemi;
    this.t = 0.12 * DAY;   // the game opens in the morning
    this.night = 0;        // 0 by day, 1 in the middle of the night
    this.rain = 0;         // 0 dry, 1 raining
    this.left = 0; this.dry = between(DRY);
    this.drift = new THREE.Vector2();
    this.wet = 0; this.wetShown = 0;   // how soaked the ground is, and the value the ground was last painted with
    this.storm = new Storm();
    this.calm = false;                 // set by the game for players who want less motion: no lightning, no thunder
    this.rumble = false;               // true in the one frame the thunder should be heard
    this.low = false;

    // cloud shadows: one large dark sheet just above the ground, with holes; it stays under the camera
    // while its pattern stays fixed to the world and drifts with the wind
    this.cloudMap = cloudShadow(2.4);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(260, 260),
      new THREE.MeshBasicMaterial({ color: 0x102410, alphaMap: this.cloudMap, transparent: true, opacity: 0.2, depthWrite: false }));
    this.clouds.rotation.x = -Math.PI / 2; this.clouds.position.y = 0.045; this.clouds.renderOrder = 2;
    scene.add(this.clouds);

    // rain: short slanted streaks that fall and start again at the top
    const pos = new Float32Array(DROPS * 6);
    this.drops = [];
    for (let i = 0; i < DROPS; i++) this.drops.push({ x: (Math.random() - 0.5) * AREA, y: Math.random() * CEILING, z: (Math.random() - 0.5) * AREA, v: 30 + Math.random() * 14 });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xd6e8ff, transparent: true, opacity: 0, depthWrite: false }));
    this.streaks.frustumCulled = false; this.streaks.visible = false;
    scene.add(this.streaks);
  }

  /** The low graphics level draws a fraction of the rain. */
  setLow(low) { this.low = low; this.streaks.geometry.setDrawRange(0, (low ? LOW_DROPS : DROPS) * 2); }

  /** How dark it is at fraction f of the day: day until 0.6, dusk until 0.7, night until 0.9, then dawn. */
  static nightAt(f) { return f < 0.6 ? 0 : f < 0.7 ? smooth(0.6, 0.7, f) : f < 0.9 ? 1 : 1 - smooth(0.9, 1, f); }

  /** @param focus  what the camera looks at: the clouds and the rain stay around it */
  update(dt, focus) {
    this.t = (this.t + dt) % DAY;
    const f = this.t / DAY, n = this.night = Sky.nightAt(f), low = 4 * n * (1 - n);   // low: 1 halfway through dusk and dawn

    // showers
    if (this.left > 0) this.left -= dt; else if ((this.dry -= dt) <= 0) { this.left = between(SHOWER); this.dry = between(DRY); }
    this.rain += ((this.left > 0 ? 1 : 0) - this.rain) * Math.min(1, dt * 0.5);

    // thunder: rarely, in the thick of a shower, the sky lights up for a moment
    this.rumble = this.calm ? false : this.storm.step(dt, this.rain);
    const flash = this.calm ? 0 : this.storm.flash;

    // light. The night is moonlit rather than black: a machine must still be told from its neighbour.
    this.sun.intensity = 3.0 * (1 - 0.78 * n) * (1 - 0.3 * this.rain);
    this.sun.color.copy(SUN_DAY).lerp(MOON, n).lerp(SUN_LOW, low * 0.7);
    this.hemi.intensity = 0.3 + 0.2 * n + 1.5 * flash; this.hemi.color.copy(SKY_DAY).lerp(SKY_NIGHT, n);
    this.renderer.toneMappingExposure = 1 - 0.36 * n - 0.1 * this.rain + 0.28 * flash;
    this.scene.fog.color.copy(AIR_DAY).lerp(AIR_NIGHT, n * 0.8).lerp(AIR_FLASH, flash * 0.45); this.scene.background.copy(this.scene.fog.color);
    for (const m of GLOW) m.emissiveIntensity = (m.userData.byDay || 0) + n;   // windows light up as it gets dark
    for (const m of LIGHT) { m.opacity = m.userData.full * n; m.visible = n > 0.02; }   // and the lamps throw their pools of light

    // wet ground: darker and shinier while it rains, and for a while after
    this.wet = wetness(this.wet, this.rain, dt);
    if (Math.abs(this.wet - this.wetShown) > 0.004 || WET.length !== this.wetCount) {   // or a yard was opened: its ground is as wet as the rest
      const w = this.wetShown = this.wet < 0.004 ? 0 : this.wet;
      this.wetCount = WET.length;
      for (const m of WET) {
        const dry = m.userData.dry;
        m.roughness = dry.roughness - 0.45 * w; m.envMapIntensity = dry.shine + 0.55 * w;
        m.color.copy(dry.color).multiplyScalar(1 - 0.22 * w);
      }
    }

    // the sun crosses from one side to the other by day; the moon comes back the same way by night
    const a = f < 0.65 ? -0.9 + 1.8 * (f / 0.65) : 0.9 - 1.8 * smooth(0.7, 0.95, f);
    sunAt.set(Math.sin(a) * 18, 27 - 7 * a * a, 9);

    // wind in the trees, and the clouds that ride on it
    wind.value += dt;
    this.drift.x += dt * 0.004; this.drift.y += dt * 0.0015;
    this.clouds.position.x = focus.x; this.clouds.position.z = focus.z;
    this.cloudMap.offset.set(focus.x / 260 * 2.4 + this.drift.x, -focus.z / 260 * 2.4 + this.drift.y);
    this.clouds.material.opacity = 0.2 * (1 - 0.6 * n) + 0.08 * this.rain;

    // rain
    const wet = this.rain > 0.02;
    this.streaks.visible = wet;
    if (wet) {
      const p = this.streaks.geometry.attributes.position, count = this.low ? LOW_DROPS : DROPS;
      for (let i = 0; i < count; i++) {
        const d = this.drops[i];
        d.y -= d.v * dt; d.x -= 6 * dt;
        if (d.y < 0) { d.y = CEILING; d.x = (Math.random() - 0.5) * AREA; d.z = (Math.random() - 0.5) * AREA; }
        const x = focus.x + d.x, z = focus.z + d.z - 4;
        p.setXYZ(i * 2, x, d.y, z); p.setXYZ(i * 2 + 1, x + 0.22, d.y + 1.25, z);
      }
      p.needsUpdate = true;
      this.streaks.material.opacity = 0.62 * this.rain;
    }
  }
}
