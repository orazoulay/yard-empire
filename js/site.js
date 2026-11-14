// @ts-check
// The building site in the world: the plot east of the Department Store, and on it the builds as far as they
// have got. What stands where is worked out as plain numbers in js/sim/site.js; this file only draws it.
//
// A building is one shape made of all its blocks (merge), plus one more for its lit windows, so a twelve-floor
// tower costs two draws. Each building is drawn again only when its own picture changes: a stage is finished,
// another twentieth of the stage in work has arrived, or the player steps into it or out of it.
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
    this.plot = null;        // the ground and the fence: made once
    this.builds = new Map(); // build id -> { key, meshes }: what was drawn of it last time
  }

  /** One shape for a list of parts, at a place on the ground. */
  shape(parts, material, x = 0, z = 0, shadows = true) {
    if (!parts.length) return null;
    const mesh = new THREE.Mesh(merge(parts.map(part)), material);
    mesh.position.set(x, 0, z);
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /**
   * Draw the site as the company has it. Called often; it only works when something changed.
   * @param company  the Company: its `site` and whether the site is open
   * @param stage    how far the stage in work has got, 0 to 1 in steps (stagePart)
   * @param inside   the id of the build the player stands inside, or '': its front wall is drawn low
   * @returns true when the picture changed, so that the game can work out again where nobody may walk
   */
  sync(company, stage = 0, inside = '') {
    const site = company.site, key = siteKey(site, company.siteOpen, stage, inside);
    if (key === this.key) return false;
    this.key = key;
    // Nothing is drawn for a company that has never had a site: the ground east of the store is simply empty.
    const any = company.siteOpen || site.at || site.done.length;
    this.group.visible = !!any;
    if (!any) return true;
    if (!this.plot) {
      const plot = plotParts();
      this.plot = this.shape(plot.parts, this.body, 0, 0, false);
      this.sign = makeSignpost('Building site', 'up'); this.sign.position.set(plot.sign[0], 0, plot.sign[1]); this.group.add(this.sign);
    }
    for (const b of BUILDS) {
      const shown = stagesShown(site, b), working = site.at === b.id;
      const own = shown + (working ? `|${stage}|${inside === b.id}` : ''), was = this.builds.get(b.id);
      if (was && was.key === own) continue;
      for (const m of was ? was.meshes : []) { this.group.remove(m); m.geometry.dispose(); }
      const parts = buildParts(b, shown, working ? { part: stage, cutaway: inside === b.id } : {}), [x, z] = lotOf(b);
      this.builds.set(b.id, { key: own, meshes: [this.shape(parts.filter(p => !p.glow), this.body, x, z), this.shape(parts.filter(p => p.glow), this.lit, x, z, false)].filter(Boolean) });
    }
    return true;
  }
}

/**
 * The sign over a lot: which building, which stage, how far, and on the site each good with what has arrived.
 * A label of the yard like the ones over the machines; what it says is worked out in js/sim/site.js (siteSign).
 */
export class SiteSign {
  /** @param labels  the game's Labels (js/labels.js) */
  constructor(labels) {
    const el = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
    this.at = { x: 0, y: 0, z: 0 };
    this.label = labels.add('site-sign', '', () => this.at);
    this.label.visible = false;
    this.title = el('div', 'ss-title'); this.sub = el('div', 'ss-sub'); this.bar = el('div', 'ss-bar'); this.fill = el('i', ''); this.goods = el('div', 'ss-goods');
    this.bar.append(this.fill);
    this.label.el.append(this.title, this.sub, this.bar, this.goods);
    this.key = '';
  }
  /**
   * @param sign  what siteSign returns, or null for no sign
   * @param near  the player is on the site: the goods are listed too
   */
  update(sign, near) {
    this.label.visible = !!sign;
    this.label.stay = near;   // on the site the sign is held in sight: a wide screen shows little of what is north of the player
    if (!sign) { this.key = ''; return; }
    [this.at.x, this.at.y, this.at.z] = sign.at;
    const goods = near ? sign.goods : [], key = [sign.title, sign.sub, sign.percent, goods.join('|')].join('#');
    if (key === this.key) return;
    this.key = key;
    this.title.textContent = sign.title;
    this.sub.textContent = sign.percent == null ? sign.sub : `${sign.sub} · ${sign.percent}%`;
    this.bar.hidden = sign.percent == null;
    this.fill.style.width = (sign.percent || 0) + '%';
    this.goods.hidden = !goods.length;
    this.goods.textContent = goods.join('\n');
  }
}
