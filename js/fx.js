// Screen-space effects: money flying to the cash counter, floating text, numbers that add up, confetti.
import * as THREE from 'three';
import { fmt } from './format.js';
import { Tally } from './ui-logic.js';

const v = new THREE.Vector3();
const CONFETTI = ['#ffd23f', '#ff8a1f', '#39c553', '#4fc3f7', '#ff5a52', '#ffffff'];
// What a number that adds up reads as, and its colour, by what is being counted.
const SUMS = {
  cash: { text: n => '+$' + fmt(n), color: '#d6ffd6' },
  stored: { text: n => `+${Math.round(n)} stored`, color: '#bfe3ff' },
};
const LEAVE_MS = 700;   // as long as the float-away in the stylesheet

export class Fx {
  constructor(container, camera, cashEl) {
    this.container = container; this.camera = camera; this.cashEl = cashEl; this.live = 0;
    // Less motion (the setting, or the system's wish): the yard interface keeps this up to date.
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sums = {}; this.spare = []; this.counting = false;
  }

  project(pos) {
    v.copy(pos).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  money(worldPos, onArrive) {
    if (this.live > 40) { onArrive?.(); return; }   // cap DOM nodes when many workers sell at once
    this.live++;
    const s = this.project(worldPos);
    const r = this.cashEl.getBoundingClientRect();
    const tx = r.left + 24, ty = r.top + r.height / 2;
    const el = document.createElement('div');
    el.className = 'money';
    el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
    this.container.appendChild(el);
    const dur = 550 + Math.random() * 150;
    const cx = s.x + (Math.random() - 0.5) * 120, cy = s.y - 120 - Math.random() * 60;
    const t0 = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - t0) / dur), u = 1 - t;
      el.style.left = (u * u * s.x + 2 * u * t * cx + t * t * tx) + 'px';
      el.style.top = (u * u * s.y + 2 * u * t * cy + t * t * ty) + 'px';
      el.style.transform = `translate(-50%,-50%) rotate(${t * 540}deg) scale(${1 - t * 0.4})`;
      if (t < 1) requestAnimationFrame(tick); else { el.remove(); this.live--; onArrive?.(); }
    };
    requestAnimationFrame(tick);
  }

  text(worldPos, str, color = '#fff') {
    const s = this.project(worldPos);
    const el = document.createElement('div');
    el.className = 'float-text'; el.textContent = str; el.style.color = color;
    el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  /**
   * A number that adds up. Selling a stack used to throw one "+$10" per item; now every amount of the
   * same `kind` ('cash' or 'stored') that follows within a moment joins one figure, which counts up to
   * the sum, stays while it grows and floats away once the selling stops.
   */
  sum(kind, worldPos, amount) {
    const s = this.sums[kind] || (this.sums[kind] = { kind, tally: new Tally(), el: null, shown: '' });
    const joined = s.tally.add(amount, performance.now() / 1000);
    if (!joined && s.el) this.release(s);
    if (!s.el) {
      s.el = this.spare.pop() || document.createElement('div');
      s.el.className = 'float-text sum'; s.el.style.color = SUMS[kind].color;
      s.shown = '';
      this.container.appendChild(s.el);
    }
    const at = this.project(worldPos);   // it follows the seller: each sale puts it back over their head
    s.el.style.left = at.x + 'px'; s.el.style.top = at.y + 'px';
    this.write(s);
    if (!this.calm) { s.el.classList.remove('pop'); void s.el.offsetWidth; s.el.classList.add('pop'); }
    if (!this.counting) { this.counting = true; this.before = performance.now(); requestAnimationFrame(now => this.count(now)); }
  }
  write(s) {
    const text = SUMS[s.kind].text(s.tally.shown);
    if (text !== s.shown) { s.shown = text; s.el.textContent = text; }
  }
  /** Runs only while a number is on screen: counts each one up, and lets it go when its selling is over. */
  count(now) {
    const dt = Math.min(0.05, (now - this.before) / 1000), t = now / 1000;
    this.before = now;
    let busy = false;
    for (const kind in this.sums) {
      const s = this.sums[kind];
      if (!s.el) continue;
      s.tally.step(this.calm ? 1 : dt);   // with less motion the figure is simply right, without the run-up
      this.write(s);
      if (s.tally.settled && s.tally.over(t)) this.release(s); else busy = true;
    }
    if (busy) requestAnimationFrame(next => this.count(next)); else this.counting = false;
  }
  /** Let a finished number float away, and keep its element for the next one. */
  release(s) {
    const el = s.el;
    s.el = null;
    el.classList.remove('pop'); el.classList.add('leave');
    setTimeout(() => { el.remove(); if (this.spare.length < 4) this.spare.push(el); }, LEAVE_MS);
  }

  confetti(count = 44) {
    if (this.calm) return;
    const ox = innerWidth / 2, oy = innerHeight * 0.3;
    const parts = [];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'confetti'; el.style.background = CONFETTI[i % CONFETTI.length];
      this.container.appendChild(el);
      const a = Math.random() * Math.PI * 2, sp = 180 + Math.random() * 380;
      parts.push({ el, x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, r: Math.random() * 360, vr: (Math.random() - 0.5) * 900 });
    }
    let last = performance.now(); const t0 = last;
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const age = (now - t0) / 1000;
      for (const p of parts) {
        p.vy += 900 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg)`;
        p.el.style.opacity = Math.max(0, 1 - Math.max(0, age - 1.1) / 0.6);
      }
      if (age < 1.8) requestAnimationFrame(tick); else for (const p of parts) p.el.remove();
    };
    requestAnimationFrame(tick);
  }
}
