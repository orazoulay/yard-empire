// @ts-check
// Virtual joystick (touch / mouse drag anywhere) + keyboard. Produces a 2D move vector.
import { stick } from './ui-logic.js';

const RADIUS = 60;
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

export class Input {
  constructor(canvas, joystickEl) {
    this.canvas = canvas;
    this.joy = joystickEl;
    this.knob = joystickEl.firstElementChild;
    this.pointer = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.keys = new Set();
    this.moved = false;
    this.onFirstMove = null;

    canvas.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => this.up(e));
    // Typing a username must not steer the player, and arrow keys must still move the text cursor.
    // A slider is steered with the arrow keys too, so it keeps them.
    const typing = e => e.target instanceof HTMLElement && e.target.matches('input, textarea, select');
    window.addEventListener('keydown', e => { if (typing(e)) return; this.keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(e) {
    if (this.pointer.active || e.button > 0) return;   // the stick is the first finger, or the main mouse button
    this.pointer.active = true; this.pointer.id = e.pointerId;
    this.pointer.ox = this.pointer.x = e.clientX; this.pointer.oy = this.pointer.y = e.clientY;
    this.joy.style.left = e.clientX + 'px'; this.joy.style.top = e.clientY + 'px';
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.joy.classList.remove('steer');
    this.joy.style.display = 'block';
    this.canvas.setPointerCapture?.(e.pointerId);
  }
  move(e) {
    if (!this.pointer.active || e.pointerId !== this.pointer.id) return;
    this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    let dx = e.clientX - this.pointer.ox, dy = e.clientY - this.pointer.oy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.joy.classList.toggle('steer', stick(dx, dy, RADIUS).len > 0);   // the ring lights up once the player really moves
  }
  up(e) {
    if (!this.pointer.active || e.pointerId !== this.pointer.id) return;
    this.pointer.active = false; this.pointer.id = null;
    this.joy.style.display = 'none';
  }

  /** True while the player is asking to move, by stick or by key. Reading it has no side effects. */
  get steering() {
    const p = this.pointer;
    if (p.active) return stick(p.x - p.ox, p.y - p.oy, RADIUS).len > 0;
    return MOVE_KEYS.some(k => this.keys.has(k));
  }

  /** Returns {x, z} with length <= 1. Screen up = -z (away from camera). */
  get vector() {
    let x = 0, z = 0, len = 0;
    if (this.pointer.active) {
      // A finger that rests where it went down, or trembles there, must not walk the player away.
      ({ x, z, len } = stick(this.pointer.x - this.pointer.ox, this.pointer.y - this.pointer.oy, RADIUS));
    } else {
      const k = this.keys;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
      len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; len = 1; }
    }
    if (len > 0.05 && !this.moved) { this.moved = true; this.onFirstMove?.(); }
    return { x, z, len };
  }
}
