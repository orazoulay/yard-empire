// The camera and what the camera can see: the eased follow of the player (with the look-ahead, the push-in of a big
// moment and the pan over a new yard), near() and seen() for what is worth animating, and the less-motion switch.
import * as THREE from 'three';

const _focus = new THREE.Vector3(), _to = new THREE.Vector3();   // used again every frame: the camera makes no garbage
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The camera of the Game. */
export class CameraMethods {
  near(x, z, dist = 28) { return Math.hypot(x - this.camFocus.x, z - this.camFocus.z) < dist * Math.max(1, this.zoom.value); }   // zoomed out, more is near
  /** True when something r wide at (x, z) may be in the camera's sight. What is not is neither animated nor drawn (js/view.js). */
  seen(x, z, r) { return this.view.sees(x, z, r); }
  /** True for players who asked for less motion, in the game's settings (if it has the switch) or on their device. */
  get calm() { return !!this.settings.reduceMotion || this.lessMotion.matches; }

  /**
   * One frame of the camera, from the player p, for dt seconds.
   * It follows the player with an eased lag, looks a little ahead of where they are really going, pulls back a touch
   * while they run and comes closer when they stand, pushes in for a big moment, and pans over a new yard. Players who
   * asked for less motion get the plain follow: no pull-back, half the look-ahead.
   */
  moveCamera(dt, p) {
    const calm = this.calm;
    this.stillFor = p.moving > 0.2 ? 0 : this.stillFor + dt;
    const wantZoom = calm ? 1 : p.moving > 0.2 ? 1.05 : this.stillFor > 1.5 ? 0.93 : 1;
    this.camZoom += (wantZoom - this.camZoom) * (1 - Math.exp(-dt * 1.4));
    this.punch = Math.max(0, this.punch - dt * 2.2);   // a short push in for a big moment
    const own = this.zoom.step(dt);   // the player's own zoom, under the camera's
    let zoom = this.camZoom * own * (1 - 0.07 * this.punch * this.punch);
    // Look ahead by where the player is really going, not by where they face: pushing against a fence does not move
    // the camera, and a quick change of direction swings it gently, because the look-ahead is eased on its own before
    // the camera follows it. At a run it is 1.8 ahead, as it always was.
    const lead = this.camLead ||= { x: 0, z: 0, px: p.pos.x, pz: p.pos.z };
    let vx = dt > 0 ? (p.pos.x - lead.px) / dt : 0, vz = dt > 0 ? (p.pos.z - lead.pz) / dt : 0;
    lead.px = p.pos.x; lead.pz = p.pos.z;
    const pace = Math.hypot(vx, vz);
    if (pace > p.speed * 3) vx = vz = 0;                                             // a jump to another yard is not a run
    else if (pace > p.speed) { vx *= p.speed / pace; vz *= p.speed / pace; }         // a frame that caught up on several steps
    const ahead = (calm ? 0.9 : 1.8) / p.speed, ease = 1 - Math.exp(-dt * 3.5);
    lead.x += (vx * ahead - lead.x) * ease; lead.z += (vz * ahead - lead.z) * ease;
    const focus = _focus.set(p.pos.x + lead.x, 0, p.pos.z + lead.z);
    if (this.reveal) {
      const r = this.reveal; r.t += dt;
      const x = r.t / r.dur, k = smooth(0, 0.25, x) * (1 - smooth(0.78, 1, x));
      focus.lerp(_to.set(r.target.x, 0, r.target.z), k);
      zoom = this.camZoom * own + (r.zoom ?? 0.55) * k;   // how far the camera pulls back: a yard fits with 0.55, the building site asks for more on a wide screen
      if (r.t >= r.dur) this.reveal = null;
      this.camFocus.copy(focus);
    } else {
      this.camFocus.lerp(focus, 1 - Math.exp(-dt * 5));
    }
    this.updateCamera(this.camFocus, innerWidth / innerHeight, zoom);
  }
}
