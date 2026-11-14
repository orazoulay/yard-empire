// DOM labels pinned to world positions (crisp text at any screen size).
//
// Once a frame: each label is moved with a transform (no layout), and only when it has moved a whole pixel. A label
// that reaches the top bar or a side of the screen fades out over half its own size instead of being cut in two or
// lying under the bar's buttons. Sizes come from a ResizeObserver, so the frame never reads the layout.
import * as THREE from 'three';

const v = new THREE.Vector3();
const STAY = { x: 0.55, low: -0.35, high: 0.5 };   // where a label that stays in sight is held: clear of the top bar, the cards at the bottom and the sides
const MIN_HALF = 16;   // px: a label not measured yet fades over at least this much

export class Labels {
  /**
   * @param o {{ avoid?: Element | null }}  avoid: the bar at the top of the screen that labels fade out under
   *   (the top bar of the HUD when there is one)
   */
  constructor(container, camera, { avoid = typeof document !== 'undefined' ? document.getElementById('topbar') : null } = {}) {
    this.container = container; this.camera = camera; this.items = [];
    this.top = 0;   // px: where the bar at the top ends
    const RO = typeof ResizeObserver === 'function' ? ResizeObserver : null;
    if (avoid && RO) new RO(() => { this.top = avoid.getBoundingClientRect().bottom; }).observe(avoid);
    // A label's size, kept up to date without reading the layout in the frame.
    this.sizes = RO ? new RO(entries => {
      for (const e of entries) {
        const it = e.target.labelItem, box = e.borderBoxSize?.[0];
        if (!it) continue;
        it.hw = (box ? box.inlineSize : e.contentRect.width) / 2; it.hh = (box ? box.blockSize : e.contentRect.height) / 2;
      }
    }) : null;
  }
  add(className, html, getWorldPos, { yOffset = 0 } = {}) {
    const el = document.createElement('div');
    el.className = 'label ' + className; el.innerHTML = html;
    this.container.appendChild(el);
    // shown, x, y, o: what was last written, so that nothing is written again while it stays the same
    const item = { el, getWorldPos, yOffset, visible: true, shown: true, x: NaN, y: NaN, o: 1, hw: 0, hh: 0 };
    el.labelItem = item;
    this.sizes?.observe(el);
    this.items.push(item);
    return item;
  }
  remove(item) { this.sizes?.unobserve(item.el); item.el.remove(); this.items = this.items.filter(i => i !== item); }
  update(width, height) {
    const top = this.top;
    for (const it of this.items) {
      let show = it.visible, x = 0, y = 0, fade = 1;
      if (show) {
        const p = it.getWorldPos();
        v.set(p.x, p.y + it.yOffset, p.z).project(this.camera);
        // A label that is told to stay in sight (it.stay) is held at the edge of the picture instead of leaving it:
        // the sign of the building site, for a player who stands at the foot of what the sign hangs over.
        if (it.stay && v.z <= 1) { v.x = Math.max(-STAY.x, Math.min(STAY.x, v.x)); v.y = Math.max(STAY.low, Math.min(STAY.high, v.y)); }
        if (v.z > 1 || Math.abs(v.x) > 1.25 || Math.abs(v.y) > 1.25) show = false;
        else {
          x = Math.round((v.x + 1) / 2 * width); y = Math.round((1 - v.y) / 2 * height);
          if (!it.stay) {
            // Fully there while the whole label is on screen and below the bar; gone once half of it would be cut off.
            const hw = Math.max(MIN_HALF, it.hw), hh = Math.max(MIN_HALF, it.hh);
            fade = Math.min(1, x / hw, (width - x) / hw, (y - top) / hh);
            if (fade <= 0.05) show = false;
          }
        }
      }
      if (show !== it.shown) { it.shown = show; it.el.style.display = show ? '' : 'none'; }
      if (!show) continue;
      if (x !== it.x || y !== it.y) { it.x = x; it.y = y; it.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`; }
      const o = Math.round(fade * 10) / 10;
      if (o !== it.o) { it.o = o; it.el.style.opacity = o >= 1 ? '' : String(o); }
    }
  }
}
