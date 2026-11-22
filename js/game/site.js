// The building site: showing it to the player (the camera goes to the plot), keeping its picture and footprints in
// step with the company, the once-a-second sign and builders, walking in through the opening, and opening a new yard.
// And the Workers' Park beside it: showing it, and the picture of an activity held there (a crowd, smoke, fireworks).
import { SITE, BUILDS, MOTIVATION } from '../data/builds.js';
import { ITEMS } from '../data/areas.js';
import { siteBlocks, siteEntrance, insideOf, stagePart, siteSign, lotOf, isPark, stagesShown } from '../sim/site.js';
import { signNear, parkShowAt, parkSmoke, parkShown, atPark, SHOW_SECONDS } from '../sim/park.js';
import { PARK_TUNE } from '../audio.js';

const BUSY_FOR = 25;                     // seconds the builders keep working after goods reached the site
const PARK_AT = { x: (SITE.park.minX + SITE.park.maxX) / 2, z: (SITE.park.minZ + SITE.park.maxZ) / 2 };   // the middle of the park's plot
const PARK_BUILD = BUILDS.find(isPark);
const SMOKE = { color: 0xe6e6e6, size: 0.42, life: 2.6, rise: 1.25 };   // from the grill, while a festival runs
const SMOKE_UP = { color: 0xe6e6e6, size: 0.8, life: 3.6, rise: 2.3 };   // and at a barbecue, whose flag it is from far: a thick column that rises four metres

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

  /** "Show me the park" in the Headquarters: the camera goes to the park's plot and comes back, as it does for the site. */
  showPark() {
    this.syncSite();
    this.hq.close();
    // The park lies south of the site: on a tall screen both plots and the tower fit; a wide one shows less depth and pulls back.
    const wide = innerWidth > innerHeight;
    this.reveal = { t: 0, dur: 5.2, target: { x: PARK_AT.x, z: PARK_AT.z + (wide ? 1.5 : 0) }, zoom: wide ? 1.45 : 0.55 };
  }

  /**
   * The picture of an activity held at the Workers' Park: its people, its lamps lit whatever the hour, smoke from the
   * grill, fireworks for a festival, for SHOW_SECONDS by the clock on the wall. A picture only: no rule waits for it,
   * and it is not saved. A second activity bought while one shows starts the picture again. The clock on the wall
   * (Date.now) goes on while a phone sleeps, so a page that wakes after the end finds the park quiet.
   * @param activity  the activity of the company's event ({ id }), or its id
   * @returns whether a picture began
   */
  parkShow(activity) {
    const id = typeof activity === 'string' ? activity : activity?.id, site = this.company.site;
    if (!MOTIVATION.activities.some(a => a.id === id) || !site.done.includes('park')) return false;
    this.syncSite();   // the park is drawn as the company has it before anybody comes
    this.parkAct = { id, from: Date.now() };
    this.sfx.setEvent(PARK_TUNE, this.parkAct.from + SHOW_SECONDS * 1000);   // music while it shows: the park's tune, over the player's own
    this.parkSmoke = 0;
    this.buildSite.park.setShow(id, this.lowGraphics ? 0.5 : 1);   // half the crowd on the low graphics level
    return true;
  }
  /** One frame of that picture, or its end: called every frame, it does nothing while the park is quiet. */
  parkFrame(dt) {
    if (!this.parkAct) return;
    const show = parkShowAt(this.parkAct, Date.now()), park = this.buildSite.park;
    if (!show || !park.show) { this.parkAct = null; park.setShow(null); this.sfx.setEvent(null); return; }   // over, cleared, or the page was away past its end: the park is quiet, the player's tune again
    const seen = park.inSight(this.view), calm = this.calm, still = this.paused || this.hqOpen;   // a sheet or the Headquarters over the game: no new rocket, no smoke
    // the crowd, the spotlights and, for a festival, the fireworks along the park's south fence (js/park.js)
    park.frame(show, { dt, night: this.sky.night, calm, seen, far: this.labels.far, still, camera: this.camera });
    if (still || !seen || show.id === 'concert' || (this.parkSmoke -= dt) > 0) return;
    const feast = show.id === 'barbecue';
    this.parkSmoke = (this.lowGraphics ? 0.8 : 0.34) * (feast ? 0.6 : 1);   // the grill smokes while a barbecue or a festival runs
    const [x, y, z] = parkSmoke();
    this.particles.puff(x, y, z, feast ? SMOKE_UP : SMOKE);
  }

  /**
   * A tap on the world (js/input.js): on the Workers' Park, once it is begun, it opens the park's card in the
   * Construction tab, where the activities are bought. Not while the Headquarters, a sheet or the tutorial is up, nor
   * while the camera is on its way somewhere, nor while the page is hidden (a tap's timer may fire after it was).
   * @param ground  where the tap's ray from the camera met the ground ({ x, z }), or null
   * @returns whether the card was opened
   */
  tapPark(ground) {
    if (document.hidden || !ground || !atPark(ground) || !this.parkOpen || this.hqOpen || this.paused || this.reveal || this.tutorial.active) return false;
    this.openPark();
    return true;
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
    if (!this.buildSite.sync(c, part, inside)) return;   // the picture changes with everything below: the site opened, a stage, a part of one
    this.siteRects = c.siteOpen ? siteBlocks(c.site, part) : [];
    this._blocks = null;
    this.parkOpen = c.siteOpen && stagesShown(c.site, PARK_BUILD) >= 0;   // a park that is begun can be walked into
    this.parkLawn = parkShown(c.site, c.site.at === PARK_BUILD.id ? part : 0).includes('lawn');   // and on its lawn the player stands a little higher (groundAt)
    if (this.buildSite.park.made && !this.parkWarm && this.renderer) { this.parkWarm = true; this.buildSite.park.warm(this.renderer, this.camera, this.scene); }
  }
  /** Once a second: what the sign over the lot says, and whether the builders have something to do. */
  siteChores() {
    const c = this.company, needs = c.siteNeeds(), build = BUILDS.find(b => b.id === c.site.at);
    const sign = siteSign({ site: c.site, needs, open: c.siteOpen, labels: Object.fromEntries(needs.map(g => [g.item, ITEMS[g.item].label])), part: this.sitePart });
    this.siteSign.update(sign, signNear(sign, this.onSite, this.player.pos.z));   // held in sight for a player on the ground it belongs to
    const given = needs.reduce((sum, g) => sum + g.have, 0);
    if (this.siteGiven >= 0 && given > this.siteGiven) this.siteBusy = BUSY_FOR; else if (this.siteBusy > 0) this.siteBusy--;
    this.siteGiven = build ? given : -1;
    this.builders.set(build && !isPark(build) && c.siteOpen ? { lot: lotOf(build), shape: build.shape, working: this.siteBusy > 0, count: this.lowGraphics ? 1 : 2, item: needs.find(g => g.have < g.need)?.item } : null);
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
    this.applyLooks();   // the yard that has just opened gets the looks bought with credits: its floor, its flag, its shop
    this._views = null; this._blocks = null;
    this.reveal = { t: 0, dur: 3.4, target: a.center };
  }
}
