// The building site in the world: the plot east of the Department Store, and on it the builds as far as they
// have got. What stands where is worked out as plain numbers in js/sim/site.js; this file only draws it.
//
// A building is one shape made of all its blocks (merge), plus one more for its lit windows, so a twelve-floor
// tower costs two draws. The plot is drawn again only when the picture changes (siteKey): a stage is finished,
// a build is started, the site opens.
import * as THREE from 'three';
import { GLOW, mat } from './world.js';
import { blockPart, merge, roundPart, solid } from './models.js';
import { makeSignpost } from './scenery.js';
import { BUILDS } from './data/builds.js';
import { buildParts, lotOf, plotParts, siteKey, stagesShown } from './sim/site.js';

const part = p => (p.kind === 'round' ? roundPart(p.rt, p.rb, p.h, p.color, p.at, p.turn, 12) : blockPart(p.w, p.h, p.d, p.color, p.at, p.turn));

export class Site {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.key = '';
    this.body = solid();   // every wall, roof and fence post: the colours are in the shapes
    // Windows with a light behind them: dim by day, and the sky turns them up at night with every other lamp (GLOW).
    this.lit = mat(0xffe9a8, { emissive: 0xffd27a, emissiveIntensity: 0.3 });
    this.lit.userData.byDay = 0.3;
    GLOW.push(this.lit);
    this.made = [];        // what was drawn last time, to be thrown away when the picture changes
  }

  /** One shape for a list of parts, at a place on the ground. */
  shape(parts, material, x = 0, z = 0, shadows = true) {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merge(parts.map(part)), material);
    mesh.position.set(x, 0, z);
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    this.group.add(mesh);
    this.made.push(mesh);
  }

  /**
   * Draw the site as the company has it. Called often; it only works when something changed.
   * @param company  the Company: its `site` and whether the site is open
   */
  sync(company) {
    const site = company.site, key = siteKey(site, company.siteOpen);
    if (key === this.key) return;
    this.key = key;
    for (const m of this.made) { this.group.remove(m); m.geometry?.dispose(); }
    this.made = [];
    // Nothing is drawn for a company that has never had a site: the ground east of the store is simply empty.
    const any = company.siteOpen || site.at || site.done.length;
    this.group.visible = !!any;
    if (!any) return;
    const plot = plotParts();
    this.shape(plot.parts, this.body, 0, 0, false);
    if (!this.sign) { this.sign = makeSignpost('Building site', 'up'); this.sign.position.set(plot.sign[0], 0, plot.sign[1]); this.group.add(this.sign); }
    for (const b of BUILDS) {
      const parts = buildParts(b, stagesShown(site, b)), [x, z] = lotOf(b);
      this.shape(parts.filter(p => !p.glow), this.body, x, z);
      this.shape(parts.filter(p => p.glow), this.lit, x, z, false);
    }
  }
}
