// @ts-check
// The player's own zoom: the wheel of a mouse (or two fingers on a trackpad), a pinch on a touch
// screen, and a double tap, a double click or the Home key to go back to normal.
// The rules (limits, easing) are in js/sim/yard.js; this file only listens.
// It multiplies the camera's own distance, so the small zooms the camera makes by itself (closer when
// the player stands, further when they run, the pan over a new yard) go on as before on top of it.
import { Zoom } from './sim/yard.js';

const TAP_MS = 260, TAP_MOVE = 14;     // a touch this short that moved this little is a tap
const DOUBLE_MS = 340, DOUBLE_MOVE = 44;   // two taps this close together, in time and place, are a double tap

export class ZoomControl {
  /** @param input  the joystick (js/input.js): a pinch takes the screen over from it */
  constructor(canvas, input) {
    this.zoom = new Zoom();
    this.touches = new Map();   // the fingers that are down, by pointer id
    this.span = 0;              // how far apart two fingers were when the pinch began; 0 = no pinch
    this.tap = null;            // the last tap, for telling a double tap
    const typing = e => e.target instanceof HTMLElement && e.target.matches('input, textarea, select');

    canvas.addEventListener('wheel', e => {
      e.preventDefault();   // the page itself must not scroll or zoom
      this.zoom.wheel(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY);   // some mice report lines, not pixels
    }, { passive: false });
    canvas.addEventListener('dblclick', () => this.zoom.reset());
    addEventListener('keydown', e => { if (e.code === 'Home' && !typing(e)) { e.preventDefault(); this.zoom.reset(); } });

    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, at: performance.now() });
      if (this.touches.size === 2) {
        // Two fingers are a pinch, not a walk: let go of the joystick, or the first finger would keep steering.
        if (input.pointer.active) input.up({ pointerId: input.pointer.id });
        this.span = this.apart(); this.zoom.pinchStart(); this.tap = null;
      }
    });
    addEventListener('pointermove', e => {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      t.x = e.clientX; t.y = e.clientY;
      if (this.span > 0 && this.touches.size >= 2) this.zoom.pinch(this.apart() / this.span);
    });
    const lift = e => {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.span = 0;
      if (e.type !== 'pointerup' || this.touches.size > 0) return;
      const now = performance.now();
      if (now - t.at > TAP_MS || Math.hypot(t.x - t.x0, t.y - t.y0) > TAP_MOVE) { this.tap = null; return; }
      if (this.tap && now - this.tap.at < DOUBLE_MS && Math.hypot(t.x - this.tap.x, t.y - this.tap.y) < DOUBLE_MOVE) { this.zoom.reset(); this.tap = null; }
      else this.tap = { x: t.x, y: t.y, at: now };
    };
    addEventListener('pointerup', lift);
    addEventListener('pointercancel', lift);
  }
  /** How far apart the first two fingers are, in pixels. */
  apart() {
    const [a, b] = [...this.touches.values()];
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }
  /** Ease toward the wanted zoom; call once a frame. Returns the zoom: 1 = normal, below it closer, above it further. */
  step(dt) { return this.zoom.step(dt); }
  get value() { return this.zoom.value; }
}
