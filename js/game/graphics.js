// The graphics level and the size of the picture: what the settings and the measured frames ask for (js/engine/quality.js).
import { PROFILES, pixelRatioFor } from '../engine/quality.js';
import { setSmallShadows } from '../items3d.js';

/** The renderer size and the graphics level of the Game. */
export class GraphicsMethods {
  resize() { this.renderer.setSize(innerWidth, innerHeight, false); }
  /**
   * The graphics level (js/engine/quality.js): the one chosen in the settings, or for 'auto' the one the measured
   * frames ask for. What each level changes is in PROFILES there; the game plays the same on every level.
   */
  applyGraphics() {
    const auto = this.settings.graphics === 'auto';
    const level = auto ? this.autoQuality.level : this.settings.graphics, scale = auto ? this.autoQuality.scale : 1;
    const q = PROFILES[level] || PROFILES.high;
    const key = q.name + '|' + scale;
    if (key === this.qualityKey) return;
    this.qualityKey = key; this.quality = q;
    const low = !q.detail;
    if (low !== this.lowGraphics) { this.lowGraphics = low; this.life.setLow(low); }   // fewer bushes, less rain, no customers: at once, without a reload
    this.particles.scale = q.particles;
    setSmallShadows(q.smallShadows);   // goods in stacks cast shadows on the richer levels only
    this.renderer.setPixelRatio(pixelRatioFor(q, devicePixelRatio, scale));
    this.resize();
    const shadow = this.sun.shadow;
    if (shadow.mapSize.x !== q.shadowMap) {
      shadow.mapSize.set(q.shadowMap, q.shadowMap);
      if (shadow.map) { shadow.map.dispose(); shadow.map = null; }   // made again at the new size
    }
  }
}
