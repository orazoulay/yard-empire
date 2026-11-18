// The view from above: how far the player's zoom may go out (every open yard and the next one on the screen), and what
// changes while the camera looks from there. The rules are in js/sim/yard.js (overviewBox, fitZoom, overviewBlend); the
// camera follows them in js/game/camera.js.
//
// From above, the labels of machines, plots and the building site step aside and each yard shows its name instead
// (js/labels.js, far), and the yard still locked says so. The shadows stop widening with the zoom (js/world.js,
// updateCamera): far out they cover the middle of the picture, and what lies outside is drawn lit, so the shadow pass
// costs no more from above than at the usual limit.
import { overviewBox, fitZoom, nameRoom } from '../sim/yard.js';

const NAME_GAP = 6;   // pixels kept free between two yards' names

/** The view from above of the Game. */
export class OverviewMethods {
  /**
   * The part of the map worth seeing from above and the zoom at which it fits this screen: { box, fit }. Worked out
   * again only when a yard opens or the screen's size changes. With it, how wide a yard's name may be before it covers
   * the next one: the narrowest yard's width on this screen, handed to the stylesheet as --yard-name-room.
   */
  overview(aspect) {
    const open = this.areas.filter(a => this.econ.areaOpen(a.id)).length, key = open + '|' + aspect.toFixed(3) + '|' + innerWidth;
    if (this.overviewKey !== key) {
      const box = overviewBox(this.areas.map(a => a.cfg), id => this.econ.areaOpen(id));
      const fit = fitZoom(box, aspect), cfgs = this.areas.map(a => a.cfg);
      this.overviewNow = { box, fit };
      const room = Math.floor(nameRoom(cfgs, id => this.econ.areaOpen(id), aspect, fit) * innerWidth) - NAME_GAP;
      document.documentElement.style.setProperty('--yard-name-room', Math.max(40, room) + 'px');
      this.overviewKey = key;
      if (this.labels.far) this.showYardNames();   // a yard opened while the player looks from above
    }
    return this.overviewNow;
  }

  /** The camera looks from above (true) or at the player (false): the labels follow, once each time it changes. */
  setFar(far) {
    if (this.labels.far === far) return;
    this.labels.far = far;
    if (far) this.showYardNames();
  }

  /** The yards' names over the yards, made the first time they are wanted: the open ones, and the next one marked as locked. */
  showYardNames() {
    this.yardNames ||= this.areas.map(a => {
      const b = a.cfg.bounds, at = { x: (b.minX + b.maxX) / 2, y: 0.5, z: (b.minZ + b.maxZ) / 2 };
      const item = this.labels.add('yard-name', '', () => at, { far: true });
      item.el.textContent = a.cfg.name;
      return { area: a, item };
    });
    let next = true;
    for (const { area, item } of this.yardNames) {
      const open = this.econ.areaOpen(area.id), shown = open || next;
      if (!open && next) next = false;
      item.visible = shown;
      item.el.classList.toggle('locked', shown && !open);
    }
  }
}
