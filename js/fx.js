// Screen-space effects: money flying to the cash counter, floating text, numbers that add up, confetti.
// Everything here is bounded and reused: a fixed number of coins and confetti pieces at most, kept in a pool once they
// land, and moved by transforms only, so the frames they fly in do no layout.
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
const MAX_COINS = 40;      // coins in the air at once; past that a sale pays without its coin (many workers selling together)
const MAX_CONFETTI = 160;  // two big moments at once; a third adds nothing until the first has fallen
const MAX_TEXTS = 12;      // floating words at once
const RECT_MS = 50;        // the cash's place on screen is read at most this often, not once per coin

export class Fx {
  constructor(container, camera, cashEl) {
    this.container = container; this.camera = camera; this.cashEl = cashEl; this.live = 0;
    // Less motion (the setting, or the system's wish): the yard interface keeps this up to date.
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sums = {}; this.spare = []; this.counting = false;
    this.coins = []; this.bits = []; this.flakes = 0; this.texts = 0;   // the pools, and how many pieces are out
    this.rect = null; this.rectAt = -1e9; this.rectOf = null;
  }

  /** Where the coins fly to: the cash in the top bar, or where it is shown now (the Headquarters' own). Read once in a while. */
  goal() {
    const at = this.target?.() || this.cashEl, now = performance.now();
    if (at !== this.rectOf || now - this.rectAt > RECT_MS) { this.rect = at.getBoundingClientRect(); this.rectAt = now; this.rectOf = at; }
    return this.rect;
  }

  project(pos) {
    v.copy(pos).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  money(worldPos, onArrive) {
    if (this.live >= MAX_COINS) { onArrive?.(); return; }   // cap DOM nodes when many workers sell at once
    this.live++;
    const s = this.project(worldPos);
    const r = this.goal();
    const tx = r.left + 24, ty = r.top + r.height / 2;
    let el = this.coins.pop();
    if (!el) { el = document.createElement('div'); el.className = 'money'; this.container.appendChild(el); }
    const spin = this.calm ? 0 : 540;   // less motion: the coin still flies to the cash, without turning over
    const place = (x, y, t) => { el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${t * spin}deg) scale(${1 - t * 0.4})`; };
    place(s.x, s.y, 0);
    el.hidden = false;
    const dur = 550 + Math.random() * 150;
    const cx = s.x + (Math.random() - 0.5) * 120, cy = s.y - 120 - Math.random() * 60;
    const t0 = performance.now();
    const tick = now => {
      const t = Math.min(1, Math.max(0, now - t0) / dur), u = 1 - t;
      place(u * u * s.x + 2 * u * t * cx + t * t * tx, u * u * s.y + 2 * u * t * cy + t * t * ty, t);
      if (t < 1) { requestAnimationFrame(tick); return; }
      el.hidden = true; this.coins.push(el); this.live--;
      onArrive?.();
    };
    requestAnimationFrame(tick);
  }

  text(worldPos, str, color = '#fff') {
    if (this.texts >= MAX_TEXTS) return;
    this.texts++;
    const s = this.project(worldPos);
    const el = document.createElement('div');
    el.className = 'float-text'; el.textContent = str; el.style.color = color;
    el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
    this.container.appendChild(el);
    setTimeout(() => { el.remove(); this.texts--; }, 1000);
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
    if (!this.calm) this.pop(s.el);
    if (!this.counting) { this.counting = true; this.before = performance.now(); requestAnimationFrame(now => this.count(now)); }
  }
  /** A short swell each time a sale joins the number; restarted without forcing a layout where the browser can. */
  pop(el) {
    if (typeof el.animate !== 'function') { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); return; }
    el.popAnim?.cancel();
    el.popAnim = el.animate([{ transform: 'translate(-50%, -85%) scale(1)' }, { transform: 'translate(-50%, -85%) scale(1.16)', offset: 0.4 }, { transform: 'translate(-50%, -85%) scale(1)' }],
      { duration: 160, easing: 'ease-out' });
  }
  write(s) {
    const text = SUMS[s.kind].text(s.tally.shown);
    if (text !== s.shown) { s.shown = text; s.el.textContent = text; }
  }
  /** Runs only while a number is on screen: counts each one up, and lets it go when its selling is over. */
  count(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.before) / 1000)), t = now / 1000;   // never below zero: see Tally.step
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
    el.popAnim?.cancel(); el.popAnim = null;
    el.classList.remove('pop'); el.classList.add('leave');
    setTimeout(() => { el.remove(); if (this.spare.length < 4) this.spare.push(el); }, LEAVE_MS);
  }

  confetti(count = 44) {
    if (this.calm) return;
    count = Math.min(count, MAX_CONFETTI - this.flakes);
    if (count <= 0) return;
    this.flakes += count;
    const ox = innerWidth / 2, oy = innerHeight * 0.3;
    const parts = [];
    for (let i = 0; i < count; i++) {
      let el = this.bits.pop();
      if (!el) { el = document.createElement('div'); el.className = 'confetti'; this.container.appendChild(el); }
      el.style.background = CONFETTI[i % CONFETTI.length];
      el.style.opacity = '';
      el.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
      el.hidden = false;
      const a = Math.random() * Math.PI * 2, sp = 180 + Math.random() * 380;
      parts.push({ el, x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, r: Math.random() * 360, vr: (Math.random() - 0.5) * 900 });
    }
    let last = performance.now(), shown = '';
    const t0 = last;
    const tick = now => {
      const dt = Math.min(0.05, Math.max(0, now - last) / 1000); last = now;
      const age = (now - t0) / 1000;
      // The fading is the same for every piece: worked out once a frame, and written only while it changes.
      const o = age > 1.1 ? String(Math.max(0, Math.round((1 - (age - 1.1) / 0.6) * 20) / 20)) : '';
      const write = o !== shown; shown = o;
      for (const p of parts) {
        p.vy += 900 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.r}deg)`;
        if (write) p.el.style.opacity = o;
      }
      if (age < 1.8) { requestAnimationFrame(tick); return; }
      for (const p of parts) { if (this.bits.length < MAX_CONFETTI / 2) { p.el.hidden = true; this.bits.push(p.el); } else p.el.remove(); }   // one big moment's worth is kept
      this.flakes -= parts.length;
    };
    requestAnimationFrame(tick);
  }
}
