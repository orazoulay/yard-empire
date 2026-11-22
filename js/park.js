// @ts-check
// The Workers' Park in the world, beside the building site: what is worked out as plain numbers in js/sim/park.js,
// drawn into the site's group. Its ground, fence, stage, stalls and lamps are five joined meshes; while an activity
// runs, a crowd as two instanced meshes with no shadows and the dark patches under it as one joined mesh, the
// spotlights' beams and coloured pools as one more, and for a festival the fireworks with the flash each burst throws
// on the ground. It has no light of its own: its night is the glow of its lamps and pools of light on the ground, as
// in the yards.
import * as THREE from 'three';
import { mat, roundedBox, soaks } from './world.js';
import { blockPart, merge, recordPart, solid } from './models.js';
import { makeSignpost } from './scenery.js';
import { edge, glowMap } from './textures.js';
import { plain, FLAT, BALL as SMALL_BALL } from './gfx/shapes.js';
import { shiningMaterial, lightPatches, lightMaterial } from './gfx/lamps.js';
import { BUILDS, SITE } from './data/builds.js';
import { isPark, stagesShown } from './sim/plotkit.js';
import { parkParts, parkPlot, parkLane, parkShown, parkSignpost, parkSky } from './sim/park.js';

// Shapes the park's parts are made of besides blocks and cylinders, each one unit large and made once: the flat square
// and the small ball are the city edge's own (js/gfx/shapes.js).
const facets = geo => { const g = plain(geo.index ? geo.toNonIndexed() : geo); g.computeVertexNormals(); return g; };   // flat faces, like the trees of the forest
const BALL = { small: SMALL_BALL, large: facets(new THREE.IcosahedronGeometry(1, 1)) };
/** A five-pointed star one unit in radius and one deep, standing up and facing south. */
const STAR = (() => {
  const pts = [], pos = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.45 : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 10];
    pos.push(0, 0, 0.5, ax, ay, 0.5, bx, by, 0.5, 0, 0, -0.5, bx, by, -0.5, ax, ay, -0.5, ax, ay, 0.5, ax, ay, -0.5, bx, by, -0.5, ax, ay, 0.5, bx, by, -0.5, bx, by, 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0.5), 2));
  g.computeVertexNormals();
  return g;
})();

/** A part of js/sim/park.js as a part for merge(): the park's own kinds, and the site's blocks and cylinders. */
const part = p => (p.kind === 'flat' ? { geo: FLAT, color: p.color, at: p.at, turn: p.turn, scale: [p.w, 1, p.d] }
  : p.kind === 'ball' ? { geo: p.r > 0.4 ? BALL.large : BALL.small, color: p.color, at: p.at, scale: [p.r, p.r * (p.sy || 1), p.r] }
    : p.kind === 'star' ? { geo: STAR, color: p.color, at: p.at, turn: p.turn, scale: [p.r, p.r, p.depth] }
      : p.kind === 'block' && p.edge ? { geo: roundedBox(p.w, p.h, p.d, Math.min(p.edge, p.w / 2, p.h / 2, p.d / 2)), color: p.color, at: p.at, turn: p.turn }
        : recordPart(p));

const QUIET = 0.25, LIT = 0.6;   // how much of the lamps' glow shows by day: in a quiet park, and while an activity runs
const CROWD = 80;                 // the most figures an activity brings (js/sim/park.js keeps well under it)
const SHOULDER = 1.36;            // how high a figure's arms hang from
const SHADE = 0.34;               // how dark the patch under a figure is by day; half of it on the lit plaza at night
const _m = new THREE.Matrix4(), _a = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
const ease = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/** The park with everything that stands or flies on it, as a box: the plot, 6 m up. */
const BOX = new THREE.Box3(new THREE.Vector3(SITE.park.minX, 0, SITE.park.minZ), new THREE.Vector3(SITE.park.maxX, 6, SITE.park.maxZ));

/**
 * A figure of the crowd as two shapes: the body, and the two arms hung from the shoulders so that they can be raised.
 * The colour stored in each corner says which of the figure's own colours it takes: red its shirt, green its
 * trousers, blue its skin, black its hair (crowdMaterial).
 */
function figureShapes() {
  const SHIRT = 0xff0000, PANTS = 0x00ff00, SKIN = 0x0000ff, HAIR = 0x000000;
  const body = merge([
    blockPart(0.26, 0.66, 0.3, PANTS, [-0.17, 0.33, 0]), blockPart(0.26, 0.66, 0.3, PANTS, [0.17, 0.33, 0]),
    { geo: roundedBox(0.72, 0.74, 0.44, 0.12), color: SHIRT, at: [0, 1.03, 0] }, { geo: roundedBox(0.5, 0.48, 0.5, 0.13), color: SKIN, at: [0, 1.66, 0] },
    blockPart(0.54, 0.2, 0.54, HAIR, [0, 1.88, 0]),
  ]);
  const arms = merge([-1, 1].flatMap(side => [blockPart(0.2, 0.36, 0.24, SHIRT, [side * 0.47, -0.14, 0]), blockPart(0.18, 0.3, 0.2, SKIN, [side * 0.47, -0.46, 0])]));
  return { body, arms };
}
/**
 * One material for the whole crowd: every figure brings its four colours with it, and after dark it is lit a little in
 * them, as by the stage. userData.flash is a colour added to every figure: a burst of the fireworks lights the crowd.
 */
function crowdMaterial() {
  const m = mat(0xffffff, { vertexColors: true, map: edge(), emissive: 0xffffff, emissiveIntensity: 0 });
  const flash = m.userData.flash = { value: new THREE.Color(0, 0, 0) };
  m.onBeforeCompile = shader => {
    shader.uniforms.uFlash = flash;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iShirt;\nattribute vec3 iPants;\nattribute vec3 iSkin;\nattribute vec3 iHair;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb = color.r * iShirt + color.g * iPants + color.b * iSkin + (1.0 - color.r - color.g - color.b) * iHair;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uFlash;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance = totalEmissiveRadiance * vColor.rgb + uFlash * (0.4 + 0.6 * vColor.rgb);');
  };
  return m;
}

// ------------------------------------------------------------------------------------------ fireworks
const SHELLS = 6;                       // shells in the air at one time
const RISE = 3, OUTER = 40, INNER = 14;   // of each shell: the points of the rocket on its way up, the sparks of the ball and of the smaller, paler ball inside it
const TRAIL = 3, LAG = 0.085;           // a spark is drawn as itself and a tail of two smaller, dimmer points, each this many seconds behind
const SPARKS = OUTER + INNER, EACH = RISE + 1 + SPARKS * TRAIL;   // the points of one shell: the rocket, the heart of the burst, the sparks
const SPARK = 11;                       // a fresh spark's width in pixels of the page, however far the camera is; it shrinks to a third as it burns out
// Strong colours only: the night of this game is bright, and a pale spark is lost on the sand. One shell in twelve is gold.
const ROCKETS = [0xff3b30, 0xffa800, 0x25e06a, 0x2a9dff, 0xff45b0, 0x9a5cff], GOLD = 0xffdf8a;
const FLASH = { size: 34, north: 6, y: 0.15, night: 0.3, day: 0.22, crowd: 0.65, fade: 0.3 };   // the flash a burst throws on the ground: how wide, how far north of the burst (toward the plaza), how strong after dark and by day, how much of it the crowd takes, and how fast it dies (seconds)
const LOW = -0.6, LENS = 6;             // a burst is brought north while the camera would show it lower than this (-1 is the screen's bottom edge), unless the lens is nearer above it than this
/**
 * A festival's fireworks. One cloud of soft points: a rocket rises, bursts into a ball of sparks in its colour around
 * a bright heart, and the sparks fly out with tails behind them, slow, sink, shrink and fade. And one mesh of
 * see-through patches on the ground (`flash`): each burst throws its colour on the lawn and the plaza for a moment, and
 * `glow` is that colour for the crowd. Nothing is lit by a real light. The sparks are drawn in their own colour by day
 * and by night: a small bright point that only adds its light to the picture clips to white on this game's bright ground.
 */
class Fireworks {
  constructor(group) {
    const n = SHELLS * EACH;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);   // a colour has a fourth number: how much of the point is there
    this.vel = new Float32Array(SHELLS * SPARKS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.PointsMaterial({ size: SPARK, sizeAttenuation: false, vertexColors: true, alphaMap: glowMap(), transparent: true, depthWrite: false, toneMapped: false });
    points.onBeforeCompile = shader => { shader.vertexShader = shader.vertexShader.replace('uniform float size;', 'uniform float size;\nattribute float aSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;'); };   // every point has a width of its own
    this.mesh = new THREE.Points(geo, points);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 7; this.mesh.name = 'park-fireworks';
    // the flashes: one square patch a shell, laid on the ground when it bursts
    this.at = new Float32Array(SHELLS * 12); this.tint = new Float32Array(SHELLS * 16);
    const patch = new THREE.BufferGeometry(), uv = [], index = [];
    for (let k = 0; k < SHELLS; k++) { uv.push(0, 1, 0, 0, 1, 0, 1, 1); index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3); }
    patch.setAttribute('position', new THREE.BufferAttribute(this.at, 3).setUsage(THREE.DynamicDrawUsage)); patch.setAttribute('color', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    patch.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); patch.setIndex(index);
    this.flash = new THREE.Mesh(patch, new THREE.MeshBasicMaterial({ vertexColors: true, alphaMap: glowMap(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));   // soft and weak, it is light added to the ground: laid over it as paint it greys the lawn
    this.flash.frustumCulled = false; this.flash.visible = false; this.flash.renderOrder = 6; this.flash.name = 'park-flash';
    this.glow = new THREE.Color(0, 0, 0);   // what the bursts of this moment throw on the crowd
    this.shells = []; for (let i = 0; i < SHELLS; i++) this.shells.push({ on: false, t: 0, rise: 0, life: 0, x: 0, y: 0, z: 0, top: 0, r: 0, g: 0, b: 0, burst: false });
    this.next = 0; this.live = 0;
    group.add(this.flash, this.mesh);
  }
  /**
   * Send one rocket up at (x, z) to burst `top` high. On a wide screen with the player on the plaza the strip along the
   * south fence lies under the bottom of the picture: such a burst is brought north, a metre at a time and no further
   * than `north`, until the camera shows it.
   */
  launch(x, z, top, camera, north) {
    const s = this.shells.find(q => !q.on);
    if (!s) return;
    if (camera && camera.position.y - top >= LENS) while (z - 1 >= north && _p.set(x, top, z).project(camera).y < LOW) z -= 1;
    _c.set(Math.random() < 1 / 12 ? GOLD : ROCKETS[Math.floor(Math.random() * ROCKETS.length)]);
    Object.assign(s, { on: true, t: 0, rise: 0.55 + Math.random() * 0.25, life: 1.5 + Math.random() * 0.5, x, y: 0, z, top, r: _c.r, g: _c.g, b: _c.b, burst: false });
  }
  /** Take every rocket, spark and flash out of the picture. */
  clear() {
    for (const s of this.shells) s.on = false;
    this.col.fill(0); this.tint.fill(0); this.glow.setRGB(0, 0, 0);
    this.mesh.geometry.attributes.color.needsUpdate = this.flash.geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = this.flash.visible = false; this.live = 0;
  }
  /**
   * @param launching  rockets go up now and then, over `sky`; false lets the last ones fade
   * @param sky        where they burst ({ minX, maxX, minZ, maxZ, low, high }: parkSky in js/sim/park.js)
   * @param night      0 by day to 1: after dark a burst throws more of its colour on the ground and the crowd
   * @param camera     the game's camera: a burst it would not show is brought into the picture (launch)
   */
  update(dt, launching, sky, night, camera) {
    if (launching && (this.next -= dt) <= 0) {
      this.next = 0.35 + Math.random() * 0.7;
      this.launch(sky.minX + Math.random() * (sky.maxX - sky.minX), sky.minZ + Math.random() * (sky.maxZ - sky.minZ), sky.low + Math.random() * (sky.high - sky.low), camera, sky.minZ - 5);
    }
    let live = 0, lights = 0;
    const { pos, col, size, vel, at, tint } = this, drag = Math.exp(-1.7 * dt), strong = FLASH.day + (FLASH.night - FLASH.day) * night;
    this.glow.setRGB(0, 0, 0);
    this.shells.forEach((s, k) => {
      if (!s.on) return;
      live++; s.t += dt;
      const base = k * EACH;
      if (s.t < s.rise) {   // the rocket on its way up: a bright head and a short tail
        for (let i = 0; i < RISE; i++) { const o = (base + i) * 3, c = (base + i) * 4, u = Math.max(0, s.t - i * 0.05) / s.rise, e = 1 - (1 - u) * (1 - u); pos[o] = s.x; pos[o + 1] = s.top * e; pos[o + 2] = s.z; col[c] = 1; col[c + 1] = 0.85; col[c + 2] = 0.5; col[c + 3] = 1 - i * 0.32; size[base + i] = 0.7 - i * 0.16; }
        return;
      }
      if (!s.burst) {   // it bursts: the sparks fly out evenly in every direction, those of the inner ball slower; the flash is laid under it
        s.burst = true;
        for (let i = 0; i < RISE; i++) col[(base + i) * 4 + 3] = 0;
        const h = (base + RISE) * 3; pos[h] = s.x; pos[h + 1] = s.top; pos[h + 2] = s.z;
        for (let i = 0; i < SPARKS; i++) {
          const inner = i >= OUTER, n = inner ? INNER : OUTER, j = inner ? i - OUTER : i;
          const o = (base + RISE + 1 + i * TRAIL) * 3, w = (k * SPARKS + i) * 3, up = 1 - 2 * (j + 0.5) / n, ring = Math.sqrt(1 - up * up), a = j * 2.399963 + k, v = inner ? 2.7 + Math.random() * 0.8 : 6 + Math.random() * 1.4;
          pos[o] = s.x; pos[o + 1] = s.top; pos[o + 2] = s.z; vel[w] = Math.cos(a) * ring * v; vel[w + 1] = up * v; vel[w + 2] = Math.sin(a) * ring * v;
        }
        const half = FLASH.size / 2, x = s.x, z = s.z - FLASH.north, q = k * 12;
        at.set([x - half, FLASH.y, z - half, x - half, FLASH.y, z + half, x + half, FLASH.y, z + half, x + half, FLASH.y, z - half], q);
        this.flash.geometry.attributes.position.needsUpdate = true;
      }
      const since = s.t - s.rise, age = since / s.life, fade = age < 0.5 ? 1 : Math.max(0, 1 - (age - 0.5) / 0.5), small = 1 - 0.66 * age;
      // the heart: one wide, pale point that is gone in a sixth of a second
      const heart = Math.max(0, 1 - since / 0.17), hc = (base + RISE) * 4;
      col[hc] = 0.6 + 0.4 * s.r; col[hc + 1] = 0.6 + 0.4 * s.g; col[hc + 2] = 0.6 + 0.4 * s.b; col[hc + 3] = heart * 0.9; size[base + RISE] = 2.4 + 2.2 * heart;
      for (let i = 0; i < SPARKS; i++) {
        const inner = i >= OUTER, p0 = base + RISE + 1 + i * TRAIL, o = p0 * 3, w = (k * SPARKS + i) * 3, pale = inner ? 0.5 : 0;
        const f = fade * (age > 0.6 && (i + Math.floor(s.t * 14)) % 3 === 0 ? 0.35 : 1), wide = small * (inner ? 0.72 : 1);   // near the end they twinkle
        vel[w] *= drag; vel[w + 1] = vel[w + 1] * drag - 2.4 * dt; vel[w + 2] *= drag;
        pos[o] += vel[w] * dt; pos[o + 1] += vel[w + 1] * dt; pos[o + 2] += vel[w + 2] * dt;
        const r = s.r + (1 - s.r) * pale, g = s.g + (1 - s.g) * pale, b = s.b + (1 - s.b) * pale;
        for (let t = 0; t < TRAIL; t++) {   // the spark, and its tail behind it along the way it flies
          const q = (p0 + t) * 3, c = (p0 + t) * 4, back = t * LAG;
          if (t) { pos[q] = pos[o] - vel[w] * back; pos[q + 1] = pos[o + 1] - vel[w + 1] * back; pos[q + 2] = pos[o + 2] - vel[w + 2] * back; }
          col[c] = r; col[c + 1] = g; col[c + 2] = b; col[c + 3] = f * (1 - t * 0.33); size[p0 + t] = wide * (1 - t * 0.25);
        }
      }
      // its light on the ground and on the crowd: full at once, gone in a third of a second
      const lit = since < 1 ? Math.exp(-since / FLASH.fade) : 0, c = k * 16;
      if (lit > 0) lights++;
      for (let i = 0; i < 4; i++) { tint[c + i * 4] = s.r; tint[c + i * 4 + 1] = s.g; tint[c + i * 4 + 2] = s.b; tint[c + i * 4 + 3] = lit * strong; }
      this.glow.r += s.r * lit * strong * FLASH.crowd; this.glow.g += s.g * lit * strong * FLASH.crowd; this.glow.b += s.b * lit * strong * FLASH.crowd;
      if (age >= 1) { s.on = false; for (let i = RISE; i < EACH; i++) col[(base + i) * 4 + 3] = 0; for (let i = 0; i < 4; i++) tint[c + i * 4 + 3] = 0; }
    });
    if (live || this.live) {
      const a = this.mesh.geometry.attributes;
      a.position.needsUpdate = a.color.needsUpdate = a.aSize.needsUpdate = this.flash.geometry.attributes.color.needsUpdate = true;
    }
    this.live = live; this.mesh.visible = live > 0; this.flash.visible = lights > 0;   // the flashes are drawn only while one shows
  }
}

export class Park {
  /** @param group  the site's group: the park is drawn into it */
  constructor(group) {
    this.group = group;
    this.key = '';        // what was drawn last: the layers, and whether the works still stand
    this.names = [];      // the layers that are drawn
    this.full = false;    // the park is finished
    this.meshes = [];     // the park itself
    this.show = null;     // what an activity added: { id, figures, meshes }
    this.made = false;
  }
  /** The park's materials and the crowd's two meshes, made the first time the park is drawn. */
  make() {
    this.made = true;
    this.body = solid({ map: edge() });   // every still part, in its own colour, shaded toward its edges like the yards' blocks
    this.ground = soaks(solid({ map: edge(), roughness: 0.95 }));   // the lawn, the paving and the asphalt: wet in the rain and white in the snow, like every other ground
    // What shines: dim by day, turned up at night with every other lamp (GLOW), each part in its own colour.
    this.lit = shiningMaterial(QUIET);
    this.pools = lightMaterial(0.42, THREE.DoubleSide);       // under the masts, before the stalls and the stage
    this.spots = lightMaterial(0.42, THREE.DoubleSide);       // an activity's beams and coloured pools
    // the dark patches under the crowd: the same soft round picture as under the player, by day and by night
    this.shade = new THREE.MeshBasicMaterial({ vertexColors: true, alphaMap: glowMap(), transparent: true, opacity: 0, depthWrite: false });
    const { body, arms } = figureShapes(), crowd = crowdMaterial();
    this.tints = ['iShirt', 'iPants', 'iSkin', 'iHair'].map(name => ({ name, attr: new THREE.InstancedBufferAttribute(new Float32Array(CROWD * 3), 3) }));
    for (const t of this.tints) { body.setAttribute(t.name, t.attr); arms.setAttribute(t.name, t.attr); }
    this.crowd = crowd;
    this.bodies = new THREE.InstancedMesh(body, crowd, CROWD); this.arms = new THREE.InstancedMesh(arms, crowd, CROWD);
    for (const m of [this.bodies, this.arms]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.name = 'park-crowd'; }
    this.fireworks = new Fireworks(this.group);
  }
  /**
   * Make the shader programs of everything an activity brings (the crowd, the patches under it, the fireworks and
   * their flashes) now, while the park is drawn, and not in the frame the first activity starts in: on a phone that
   * would be a hitch. Nothing is drawn. It makes four programs, and the count of programs still falls with it:
   * compile() sets up the scene's lights before the first picture, so six of the shadow pass's programs are not
   * built a second time (measured 44 without the warm-up, 42 with). It is not there to save programs: at the 4x
   * slowdown a festival's first frame is 31 to 37 ms with it and 45 to 58 without.
   * @param renderer  the game's WebGLRenderer  @param camera  its camera  @param scene  the scene, for its lights
   */
  warm(renderer, camera, scene) {
    if (!this.made) return;
    // The patches' mesh is made anew for every activity: a stand-in of the same make. A program is keyed on what the
    // shape carries (the patches have no normals), so a flat shape with normals would warm a program nothing uses.
    const patch = new THREE.Mesh(lightPatches([{ kind: 'shade', size: 1, color: 0, at: [0, 0, 0] }]), this.shade);
    for (const o of [this.bodies, this.fireworks.mesh, this.fireworks.flash, patch]) renderer.compile(o, camera, scene);   // the arms share the bodies' material and kind of mesh
    patch.geometry.dispose();
  }
  mesh(parts, material, cast, name) {
    if (!parts.length) return null;
    const m = new THREE.Mesh(merge(parts.map(part)), material);
    m.castShadow = cast; m.receiveShadow = material !== this.lit; m.matrixAutoUpdate = false; m.name = name;
    this.group.add(m);
    return m;
  }
  drop(meshes) { for (const m of meshes) { this.group.remove(m); m.geometry.dispose(); } }
  /**
   * True when any of the park may be in the camera's sight: its whole box against the camera's view. A ball around a
   * plot this large reaches into the picture from well outside it, and the crowd would be drawn for nobody.
   * @param view  the game's View (js/view.js)
   */
  inSight(view) { return view.all || !view.ready || view.frustum.intersectsBox(BOX); }

  /**
   * Draw the park as far as it has got. It works only when a layer was added or the park was finished.
   * @param site   the company's site  @param stage  how far the stage in work has got (stagePart)
   */
  sync(site, stage) {
    const b = BUILDS.find(isPark), begun = stagesShown(site, b) >= 0, finished = site.done.includes(b.id);
    const names = begun ? parkShown(site, site.at === b.id ? stage : 0) : [], key = begun ? names.join(',') + '|' + finished : '';
    if (key === this.key) return;
    this.key = key; this.names = names; this.full = finished;
    this.drop(this.meshes); this.meshes = [];
    if (!finished && this.show) this.setShow(null);   // a company that was sold and begins again has no crowd left in a park it has not got
    if (this.sign) this.sign.visible = begun;
    if (!begun) return;
    if (!this.made) this.make();
    if (!this.sign) { this.sign = makeSignpost("Workers' Park", 'down'); const [x, z] = parkSignpost(); this.sign.position.set(x, 0, z); this.group.add(this.sign); }
    const parts = [...parkPlot({ works: !finished }), ...parkLane(), ...parkParts(names)];
    const still = parts.filter(p => !p.night), light = new THREE.Mesh(lightPatches(parts.filter(p => p.kind === 'pool')), this.pools);
    light.renderOrder = 3; light.matrixAutoUpdate = false; light.name = 'park-pools'; this.group.add(light);
    this.meshes = [this.mesh(still.filter(p => p.cast), this.body, true, 'park-still'), this.mesh(still.filter(p => !p.cast && !p.ground), this.body, false, 'park-small'),
      this.mesh(still.filter(p => p.ground), this.ground, false, 'park-ground'),
      this.mesh(parts.filter(p => p.night && p.kind !== 'pool'), this.lit, false, 'park-lit'), light].filter(Boolean);
  }

  /**
   * An activity begins, or ends: its people, its spotlights and its lamps lit whatever the hour; or the quiet park again.
   * @param id     'barbecue', 'concert' or 'festival'; null for none  @param crowd  the share of the people to draw
   */
  setShow(id, crowd = 1) {
    if (this.show) { this.drop(this.show.meshes); this.group.remove(this.bodies, this.arms); this.fireworks.clear(); this.crowd.userData.flash.value.setRGB(0, 0, 0); this.show = null; }
    if (this.made) this.lit.userData.byDay = id && this.full ? LIT : QUIET;
    if (!id || !this.full) return;
    const parts = parkParts(this.names, { lit: true, crowd, activity: id }).filter(p => p.show), figures = parts.filter(p => p.kind === 'figure').slice(0, CROWD);
    const beams = new THREE.Mesh(lightPatches(parts.filter(p => p.kind === 'pool' || p.kind === 'beam')), this.spots);
    beams.renderOrder = 4; beams.matrixAutoUpdate = false; beams.name = 'park-spots'; this.group.add(beams);
    figures.forEach((f, i) => {
      this.tints.forEach(t => { _c.set(f[t.name.slice(1).toLowerCase()]); t.attr.setXYZ(i, _c.r, _c.g, _c.b); });
      f.delay = f.key ? 0.2 : 0.4 + (f.phase / 6.3) * 4.5;   // they come in over the first seconds, and go over the last
    });
    for (const t of this.tints) t.attr.needsUpdate = true;
    _m.makeScale(0, 0, 0);
    for (const m of [this.bodies, this.arms]) { m.count = figures.length; for (let i = 0; i < figures.length; i++) m.setMatrixAt(i, _m); m.instanceMatrix.needsUpdate = true; this.group.add(m); }
    const shades = new THREE.Mesh(lightPatches(parts.filter(p => p.kind === 'shade')), this.shade);   // a dark patch under every figure: they stand where they are put
    shades.renderOrder = 5; shades.matrixAutoUpdate = false; shades.name = 'park-shade'; this.shade.opacity = 0; this.group.add(shades);
    this.show = { id, figures, shades, meshes: [beams, shades, this.mesh(parts.filter(p => p.kind === 'block' || p.kind === 'round'), this.body, false, 'park-band')].filter(Boolean) };
  }

  /**
   * One frame of an activity's picture: the crowd comes, jumps and waves, the band plays, the spotlights breathe.
   * @param show  { t, left }: seconds since the picture began and seconds left (parkShowAt)
   * @param o     dt: seconds since the last frame; night: 0 by day to 1; calm: the player asked for less motion;
   *              seen: the park is in the camera's sight; far: the camera looks at the whole company from above, where
   *              a figure is a few pixels and is not drawn, like the yards' workers; still: a sheet or the Headquarters is open
   *              over the game, so no new rocket goes up; camera: the game's camera, for where the fireworks are seen
   */
  frame(show, { dt = 0, night = 0, calm = false, seen = true, far = false, still = false, camera = null } = {}) {
    const s = this.show;
    if (!s) return;
    // a festival's fireworks, along the park's south fence; none for players who asked for less motion
    this.fireworks.update(dt, s.id === 'festival' && !calm && !still && seen && show.left > 3, parkSky(), night, camera);
    this.crowd.userData.flash.value.copy(this.fireworks.glow);   // a burst lights the crowd in its colour for a moment
    this.spots.userData.full = calm ? 0.42 : 0.4 + 0.1 * Math.sin(show.t * 6.2);
    this.crowd.emissiveIntensity = 0.55 * night;   // after dark the people are lit by the stage and the stalls, not by the moon alone
    this.lit.userData.byDay = LIT - (LIT - QUIET) * night;   // by day the lamps are turned up to be seen at all; the night turns them up by itself
    this.bodies.visible = this.arms.visible = s.shades.visible = seen && !far;
    this.shade.opacity = SHADE * (1 - 0.5 * night) * ease(show.t / 3) * ease(show.left / 2);   // the patches come and go with the people; on the lit plaza at night they are half as dark
    if (!seen || far) return;
    const time = calm ? 0 : show.t;
    s.figures.forEach((f, i) => {
      const grow = ease((show.t - f.delay) / 0.4) * ease((show.left - f.delay * 0.6) / 0.4), a = time * 6.2 + f.phase, slow = time * 1.3 + f.phase;
      let [x, y, z] = f.at, yaw = f.turn, arm = -0.12;
      if (f.pose === 'cheer') { y += Math.max(0, Math.sin(a)) * 0.22; arm = -2.75 + 0.3 * Math.sin(a * 0.5); yaw += 0.12 * Math.sin(slow); }
      else if (f.pose === 'play') { x += 0.1 * Math.sin(time * 3.1 + f.phase); arm = -1.15 + 0.28 * Math.sin(time * 9 + f.phase); yaw += 0.16 * Math.sin(slow); }
      else if (f.pose === 'sit') { y -= 0.42; arm = -0.95 + 0.1 * Math.sin(slow); }
      else if (f.pose === 'cook') arm = -1.05 + 0.2 * Math.sin(time * 3 + f.phase);
      else if (f.pose === 'serve') arm = -0.7 + 0.25 * Math.sin(time * 2 + f.phase);
      else yaw += 0.28 * Math.sin(slow * 0.6);
      _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, yaw), _s.setScalar(f.size * grow));
      this.bodies.setMatrixAt(i, _m);
      this.arms.setMatrixAt(i, _a.makeRotationX(arm).setPosition(0, SHOULDER, 0).premultiply(_m));
    });
    this.bodies.instanceMatrix.needsUpdate = this.arms.instanceMatrix.needsUpdate = true;
  }
}
