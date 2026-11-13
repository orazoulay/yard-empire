// Pooled 3D particles (one instanced mesh): sawdust, sparkles, dust puffs.
// And, in a second instanced mesh, smoke: soft round puffs that rise, swell, drift with the wind and thin out.
import * as THREE from 'three';
import { mat, wind } from './world.js';

const MAX = 320;
const PUFFS = 96;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _e = new THREE.Euler(), _c = new THREE.Color();

export class Particles {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts = [];
    for (let i = 0; i < MAX; i++) {
      this.parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, g: 9, rot: 0, vr: 0 });
      this.mesh.setColorAt(i, _c.set(0xffffff));
    }
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, _m);
    this.next = 0; this.live = 0;
    scene.add(this.mesh);
    this.low = false;   // on the low graphics level every burst is half as large

    // Smoke is lit like everything else (so it is grey at night, not glowing) and see-through.
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
      mat(0xffffff, { roughness: 1, envMapIntensity: 0.25, transparent: true, opacity: 0.5, depthWrite: false }), PUFFS);
    this.smoke.frustumCulled = false;
    this.smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puffs = [];
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < PUFFS; i++) {
      this.puffs.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.5 });
      this.smoke.setMatrixAt(i, _m); this.smoke.setColorAt(i, _c.set(0xffffff));
    }
    this.nextPuff = 0; this.livePuffs = 0;
    scene.add(this.smoke);
  }

  /** One puff of smoke from (x, y, z). rise = how fast it goes up at first; it slows as it spreads. */
  puff(x, y, z, { color = 0xdcdcdc, size = 0.5, life = 2.8, rise = 1.5 } = {}) {
    const i = this.nextPuff; this.nextPuff = (this.nextPuff + 1) % PUFFS;
    const p = this.puffs[i];
    p.x = x + (Math.random() - 0.5) * 0.15; p.y = y; p.z = z + (Math.random() - 0.5) * 0.15;
    p.vx = (Math.random() - 0.5) * 0.3; p.vz = (Math.random() - 0.5) * 0.3; p.vy = rise * (0.8 + Math.random() * 0.4);
    p.life = p.max = life * (0.8 + Math.random() * 0.4);
    p.size = size * (0.8 + Math.random() * 0.4);
    this.smoke.setColorAt(i, _c.set(color));
    this.smoke.instanceColor.needsUpdate = true;
  }

  /**
   * @param pos {x,y,z}  origin
   * @param o   { count, color, speed, up, spread, life, size, gravity, ring }
   *            ring: particles fly outward along the ground instead of in a cone
   */
  emit(pos, { count = 6, color = 0xffffff, speed = 2.5, up = 3, spread = 0.3, life = 0.6, size = 0.12, gravity = 9, ring = false } = {}) {
    if (this.low) count = Math.ceil(count / 2);
    for (let n = 0; n < count; n++) {
      const i = this.next; this.next = (this.next + 1) % MAX;
      const p = this.parts[i];
      const a = Math.random() * Math.PI * 2, sp = speed * (0.5 + Math.random() * 0.7);
      p.x = pos.x + (Math.random() - 0.5) * spread; p.y = (pos.y || 0) + Math.random() * spread * 0.5; p.z = pos.z + (Math.random() - 0.5) * spread;
      p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp;
      p.vy = ring ? up * Math.random() * 0.4 : up * (0.6 + Math.random() * 0.6);
      p.life = p.max = life * (0.7 + Math.random() * 0.6);
      p.size = size * (0.7 + Math.random() * 0.6); p.g = gravity;
      p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 12;
      this.mesh.setColorAt(i, _c.set(color));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); live++; continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += p.vr * dt;
      const k = p.life / p.max, s = p.size * (k < 0.4 ? k / 0.4 : 1);
      _p.set(p.x, p.y, p.z); _q.setFromEuler(_e.set(p.rot, p.rot * 0.7, 0)); _s.set(s, s, s);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      live++;
    }
    if (live || this.live) this.mesh.instanceMatrix.needsUpdate = true;
    this.live = live;
    this.drift(dt);
  }

  /** Move the smoke: up, slower and slower, and off with the wind, which blows the way the clouds and the rain go. */
  drift(dt) {
    let live = 0;
    const gust = -(1.0 + 0.5 * Math.sin(wind.value * 0.6));
    _q.identity();
    for (let i = 0; i < PUFFS; i++) {
      const p = this.puffs[i];
      if (p.life <= 0) continue;
      p.life -= dt; live++;
      if (p.life <= 0) { _m.makeScale(0, 0, 0); this.smoke.setMatrixAt(i, _m); continue; }
      const age = 1 - p.life / p.max;
      p.vx += (gust * age - p.vx) * Math.min(1, dt * 1.2);   // the higher it is, the more the wind has it
      p.vy *= 1 - Math.min(1, dt * 0.5);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      // it swells as it rises, and thins out to nothing at the end rather than popping
      const s = p.size * (0.4 + 1.1 * age) * Math.min(1, age / 0.08) * Math.min(1, (1 - age) / 0.4);
      _p.set(p.x, p.y, p.z); _s.set(s, s * 0.85, s);
      this.smoke.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    if (live || this.livePuffs) this.smoke.instanceMatrix.needsUpdate = true;
    this.livePuffs = live;
  }
}
