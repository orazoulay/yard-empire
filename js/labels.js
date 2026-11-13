// DOM labels pinned to world positions (crisp text at any screen size).
import * as THREE from 'three';

const v = new THREE.Vector3();

export class Labels {
  constructor(container, camera) {
    this.container = container; this.camera = camera; this.items = [];
  }
  add(className, html, getWorldPos, { yOffset = 0 } = {}) {
    const el = document.createElement('div');
    el.className = 'label ' + className; el.innerHTML = html;
    this.container.appendChild(el);
    const item = { el, getWorldPos, yOffset, visible: true };
    this.items.push(item);
    return item;
  }
  remove(item) { item.el.remove(); this.items = this.items.filter(i => i !== item); }
  update(width, height) {
    for (const it of this.items) {
      if (!it.visible) { it.el.style.display = 'none'; continue; }
      const p = it.getWorldPos();
      v.set(p.x, p.y + it.yOffset, p.z).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.25 || Math.abs(v.y) > 1.25) { it.el.style.display = 'none'; continue; }
      it.el.style.display = '';
      it.el.style.left = ((v.x + 1) / 2 * width) + 'px';
      it.el.style.top = ((1 - v.y) / 2 * height) + 'px';
    }
  }
}
