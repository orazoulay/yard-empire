// What the camera can see. Machines, workers and trucks ask before they animate themselves: what is
// out of sight is not moved, not posed and not drawn, though its rules run as ever.
//
// The test is the camera's own view (a ball around the thing against the six sides of the view), not
// a distance from the player: on a tall phone screen the camera sees two yards up the map and hardly
// anything to the sides, and a distance would get both wrong.
//
// What it saves, measured without a browser on a stand-in renderer that walks the scene and draws
// nothing (everything bought: 20 yards, 40 workers, 12 trucks; the camera on one yard): the game's
// own work per frame went from 1.97 ms to 1.16 ms, and the objects handed to the renderer from 3832
// to 1846. The cost of the drawing itself was not measured. In the browser, game.loopMs is the
// smoothed cost of a frame's work, and game.view.all = true switches the skipping off to compare.
import * as THREE from 'three';

const FOG_END = 110;   // the far end of the fog in js/world.js: beyond it everything is the colour of the air

export class View {
  constructor(camera) {
    this.camera = camera;
    this.frustum = new THREE.Frustum(); this.matrix = new THREE.Matrix4(); this.ball = new THREE.Sphere();
    this.ready = false;   // until the camera has been placed once, everything counts as seen
    this.all = false;     // set true (in the console: game.view.all = true) to animate everything, to measure what this saves
  }
  /** Call once a frame, after the camera has moved. */
  update() {
    const c = this.camera;
    this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
    this.ready = true;
  }
  /**
   * True when something at (x, z) on the ground may be in sight.
   * @param r  how far the thing reaches from that point, with room for its shadow and for one frame of movement
   */
  sees(x, z, r = 6) {
    if (this.all || !this.ready) return true;
    const b = this.ball, p = this.camera.position;
    b.center.set(x, 1.5, z); b.radius = r;
    if (!this.frustum.intersectsSphere(b)) return false;
    const far = (this.camera.userData.fogFar ?? FOG_END) + r;   // the fog moves back with the camera (js/world.js)
    return (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < far * far;
  }
}
