// The building site: showing it to the player (the camera goes to the plot), keeping its picture and footprints in
// step with the company, the once-a-second sign and builders, walking in through the opening, and opening a new yard.
import { SITE, BUILDS } from '../data/builds.js';
import { ITEMS } from '../data/areas.js';
import { siteBlocks, siteEntrance, insideOf, stagePart, siteSign, lotOf } from '../sim/site.js';

const BUSY_FOR = 25;                     // seconds the builders keep working after goods reached the site

/** The building site of the Game. */
export class SiteMethods {
  /**
   * Show the building site: the camera goes to the plot and comes back, the move that introduces a new yard.
   * @param fromHq  the player asked for it in the Headquarters, which closes. When the game shows the site by
   *                itself, an open Headquarters stays open and the camera stays where it is.
   */
  showSite(fromHq = true) {
    this.syncSite();   // what the camera is about to show is what the company has now
    // Shown by the game itself, the site does not take the camera from an open Headquarters, nor from a new yard that is
    // being shown: the site opens with the last gate, and the yard behind that gate is what the player has just paid for.
    // A player who stands on the site is looking at it already.
    if (fromHq) this.hq.close(); else if (this.hqOpen || this.reveal || this.onSite) return;
    const p = SITE.plot;
    // The camera always shows the same width of ground, so a wide screen shows less depth: there it pulls back further,
    // or the tower at the back of the plot would be cut off.
    const wide = innerWidth > innerHeight;
    this.reveal = { t: 0, dur: 4.2, target: { x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2 + (wide ? 2 : 0) }, zoom: wide ? 1.75 : 0.55 };
  }

  /**
   * The site as the company has it now: its picture, and the footprints nobody walks through. The stage in work is
   * drawn as far as its goods have arrived, and the front wall of a building the player stands in is drawn low.
   */
  syncSite() {
    const c = this.company, p = this.player?.pos;
    const part = c.site.at ? stagePart(c.siteNeeds()) : 0;
    const inside = p && this.onSite ? insideOf(c.site, part, p.x, p.z) : '';
    this.sitePart = part;
    if (!this.buildSite.sync(c, part, inside)) return;
    this.siteRects = c.siteOpen ? siteBlocks(c.site, part) : [];
    this._blocks = null;
  }
  /** Once a second: what the sign over the lot says, and whether the builders have something to do. */
  siteChores() {
    const c = this.company, needs = c.siteNeeds(), build = BUILDS.find(b => b.id === c.site.at);
    this.siteSign.update(siteSign({ site: c.site, needs, open: c.siteOpen, labels: Object.fromEntries(needs.map(g => [g.item, ITEMS[g.item].label])), part: this.sitePart }), this.onSite);
    const given = needs.reduce((sum, g) => sum + g.have, 0);
    if (this.siteGiven >= 0 && given > this.siteGiven) this.siteBusy = BUSY_FOR; else if (this.siteBusy > 0) this.siteBusy--;
    this.siteGiven = build ? given : -1;
    this.builders.set(build && c.siteOpen ? { lot: lotOf(build), shape: build.shape, working: this.siteBusy > 0, count: this.lowGraphics ? 1 : 2, item: needs.find(g => g.have < g.need)?.item } : null);
  }
  /** "Go to the site" in the Headquarters: the player stands just inside the plot's entrance. */
  goToSite() {
    if (!this.company.siteOpen) return false;
    const e = siteEntrance();
    this.hq.close();
    this.player.pos.set(e.x, 0, e.z);
    this.playerArea = this.area(SITE.gate.yard) || this.playerArea;
    this.camFocus.set(e.x, 0, e.z);
    this.particles.emit({ x: e.x, y: 0.3, z: e.z }, { count: 18, color: 0xffffff, speed: 4, up: 4, life: 0.6, size: 0.18, spread: 0.8 });
    return true;
  }

  /** Called when a gate is bought: build the new yard and pan the camera over it. */
  openArea(id) {
    const a = this.area(id);
    if (!a || a.open) return;
    a.buildOpen();
    this._views = null; this._blocks = null;
    this.reveal = { t: 0, dur: 3.4, target: a.center };
  }
}
