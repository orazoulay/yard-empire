// @ts-check
// Animated green chevrons from the player to the current objective, plus a pulsing target ring.
import * as THREE from 'three';

const COUNT = 16, SPACING = 1.1;

export class Guide {
  constructor(scene) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.45, -0.25); shape.lineTo(0, 0.2); shape.lineTo(0.45, -0.25);
    shape.lineTo(0.45, -0.5); shape.lineTo(0, -0.05); shape.lineTo(-0.45, -0.5); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    this.group = new THREE.Group();
    this.meshes = [];
    for (let i = 0; i < COUNT; i++) {
      // one material each: every arrow fades on its own, in at the player and out at the target
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x58e85c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      m.position.y = 0.06; this.group.add(m); this.meshes.push(m);
    }
    scene.add(this.group);
    this.t = 0;
  }
  /** @param route  the points to walk through, from the player to the target (two or more), or nothing to hide the arrows */
  update(dt, route) {
    const legs = [];
    let total = 0;
    for (let i = 1; route && i < route.length; i++) {
      const a = route[i - 1], b = route[i], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len > 0.01) { legs.push({ a, nx: (b.x - a.x) / len, nz: (b.z - a.z) / len, start: total, len }); total += len; }
    }
    if (total < 2.2) { this.group.visible = false; return; }
    this.group.visible = true;
    this.t = (this.t + dt * 3) % SPACING;
    this.wave = (this.wave || 0) + dt * 5;
    const start = 1.2, end = total - 1.0;
    for (let i = 0; i < COUNT; i++) {
      const s = start + this.t + i * SPACING;
      const m = this.meshes[i];
      if (s > end) { m.visible = false; continue; }
      const leg = legs.find(l => s <= l.start + l.len) || legs[legs.length - 1], along = s - leg.start;
      m.visible = true;
      m.position.x = leg.a.x + leg.nx * along; m.position.z = leg.a.z + leg.nz * along;
      m.rotation.y = Math.atan2(leg.nx, leg.nz);
      const fade = Math.min(1, (end - s) / 1.5) * Math.min(1, (s - start + 0.4) / 1);
      const wave = 0.5 + 0.5 * Math.sin(s * 1.4 - this.wave);   // a brighter band that runs along the path toward the target
      m.scale.setScalar(0.6 + 0.25 * fade + 0.07 * wave);
      m.material.opacity = Math.max(0, fade) * (0.5 + 0.4 * wave);
    }
  }
}

/** A pulsing yellow ring on the ground, used to highlight the tutorial target. */
export class Pulse {
  constructor(scene) {
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.y = 0.6; this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.t = 0;
  }
  update(dt, zone) {
    if (!zone) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.t = (this.t + dt * 0.9) % 1;
    const r = Math.min(zone.radius, 2.6) * (0.75 + this.t * 0.6);
    this.mesh.position.x = zone.x; this.mesh.position.z = zone.z;
    this.mesh.scale.setScalar(r);
    this.mesh.material.opacity = 0.9 * (1 - this.t);
  }
}
