// @ts-check
// Pure port rules: the ships of one company, what is in their holds, which goods the player marked for export,
// and the refit that is running. No rendering and no browser APIs here; the numbers are in PORT (js/data/company.js).
//
// A ship is at the quay (left === 0) or at sea (left > 0). What it will pay is fixed when it sails and saved with it,
// so a save loaded again pays the same sum, once. The clock is handed in by the Company in seconds of play; nothing
// here reads a device's clock. Prices, the size of a hold and how long a voyage takes are the Company's to know.
import { PORT } from '../data/company.js';

export const MAX_SHIPS = 2;
const count = (v, top) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Number(v), top) : 0);
const routeId = id => (PORT.routes.some(r => r.id === id) ? id : null);

function readShip(s, goods) {
  const hold = {};
  if (s?.hold && typeof s.hold === 'object') for (const g of goods) { const n = Math.floor(count(s.hold[g], 1e6)); if (n >= 1) hold[g] = n; }
  const route = routeId(s?.route), left = route ? count(s?.left, 1e6) : 0;
  return { hold, route: left > 0 ? route : null, next: routeId(s?.next) || PORT.routes[0].id, left,
    total: left > 0 ? Math.max(left, count(s?.total, 1e6)) : 0, pay: left > 0 ? count(s?.pay, 1e30) : 0 };
}

export class Port {
  /**
   * @param goods  ids of the goods a ship takes, read from the yard data by the Company
   * @param saved  the `port` part of a company save, or null (a save from before the port, or no ship bought yet)
   */
  constructor(goods = [], saved = null) {
    const s = saved && typeof saved === 'object' ? saved : null;
    this.goods = [...goods];
    this.ships = (Array.isArray(s?.ships) ? s.ships : []).slice(0, MAX_SHIPS).map(x => readShip(x, this.goods));
    this.marks = {};                                   // good -> true: it goes aboard instead of being sold
    for (const g of this.goods) if (s?.marks && s.marks[g]) this.marks[g] = true;
    const ids = PORT.refits.map(r => r.id), raw = Array.isArray(s?.refit?.done) ? s.refit.done : [];
    const done = ids.filter(id => raw.includes(id));
    const at = ids.includes(s?.refit?.at) && !done.includes(s.refit.at) ? s.refit.at : null;
    this.refit = { done, at, given: at ? Math.floor(count(s.refit.given, 1e6)) : 0 };
  }
  toJSON() {
    return { ships: this.ships.map(x => ({ hold: x.hold, next: x.next,
        ...(x.left > 0 ? { route: x.route, left: Math.ceil(x.left), total: Math.ceil(x.total), pay: Math.floor(x.pay) } : {}) })),
      marks: this.marks, refit: this.refit };
  }

  get open() { return this.ships.length > 0; }
  /** The company owns `n` ships now. */
  ensure(n) {
    n = Math.max(0, Math.min(MAX_SHIPS, Math.floor(n) || 0));
    while (this.ships.length < n) this.ships.push(readShip(null, this.goods));
    if (this.ships.length > n) this.ships.length = n;
  }
  takes(item) { return this.goods.includes(item); }
  aboard(ship) { let n = 0; for (const k in ship.hold) n += ship.hold[k]; return n; }
  atSea(ship) { return ship.left > 0; }
  /** The ship a good would go into: the first one at the quay with room in a hold of `size`, or null. */
  berth(size) { return this.ships.find(x => !this.atSea(x) && this.aboard(x) < size) || null; }
  /** One `item` goes aboard. @returns false when no ship at the quay takes it */
  load(item, size) {
    const ship = this.takes(item) ? this.berth(size) : null;
    if (!ship) return false;
    ship.hold[item] = (ship.hold[item] || 0) + 1;
    return true;
  }
  mark(item, on) {
    if (!this.takes(item)) return false;
    if (on) this.marks[item] = true; else delete this.marks[item];
    return true;
  }
  /** Ship `i` sails to `route` for `seconds` of play and will pay `pay` when it is back. */
  send(i, route, seconds, pay) {
    const ship = this.ships[i];
    if (!ship || this.atSea(ship) || !this.aboard(ship) || !routeId(route) || !(seconds > 0)) return false;
    Object.assign(ship, { route, next: route, left: seconds, total: seconds, pay: Math.max(0, Number(pay) || 0) });
    return true;
  }
  /** Take everything out of ship `i` at the quay. @returns what was in it, or null */
  unload(i) {
    const ship = this.ships[i];
    if (!ship || this.atSea(ship) || !this.aboard(ship)) return null;
    const hold = ship.hold; ship.hold = {};
    return hold;
  }
  /** `dt` seconds of play pass. @returns the ships that came home: [{ index, route, pay, goods }] */
  tick(dt) {
    const home = [];
    if (!(dt > 0)) return home;
    this.ships.forEach((ship, index) => {
      if (!this.atSea(ship)) return;
      ship.left -= dt;
      if (ship.left > 0) return;
      home.push({ index, route: ship.route, pay: ship.pay, goods: this.aboard(ship) });
      Object.assign(ship, { hold: {}, route: null, left: 0, total: 0, pay: 0 });
    });
    return home;
  }
  /** The company was sold: its ships, their holds, the marks and the refits go with it. */
  reset() { this.ships = []; this.marks = {}; this.refit = { done: [], at: null, given: 0 }; }
}
