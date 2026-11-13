// Pure game-state logic: cash, purchases, derived stats from unlocked upgrades. No rendering here.
import { PRESTIGE } from '../data/company.js';

/** Two significant digits, like the generated costs: 1,234 -> 1,200. */
const roundCost = n => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1)); return Math.round(n / p) * p; };

export const SAVE_VERSION = 3;   // 3 added `company` (js/sim/company.js); older saves load unchanged

export class Economy {
  /**
   * @param {{ items: Record<string,{price:number}>, upgrades: Array, baseCapacity: number, firstArea: string }} content
   * @param {object|null} saved
   */
  constructor(content, saved) {
    this.items = content.items;
    this.upgrades = content.upgrades;
    this.baseCapacity = content.baseCapacity;
    this.cash = 0;
    this.unlocked = {};
    this.paid = {};
    this.areas = [content.firstArea];
    this.tutorialDone = false;
    this.workerRate = 0;   // measured $/s from worker sales, used for offline earnings
    this.lastSeen = 0;     // ms timestamp of the last save
    this.boost = { price: 1, speed: 1 };   // company research: multiplies every price and every machine speed
    this.company = null;   // set by the Company so that it is saved inside this save
    // A company founded after a sale costs more to build, by the legacy stars in the save (see scaleCosts).
    this.scaleCosts(1 + PRESTIGE.costPerStar * (Number(saved?.company?.legacy?.stars) > 0 ? Number(saved.company.legacy.stars) : 0));
    if (saved) {
      this.workerRate = Number(saved.workerRate) > 0 ? Number(saved.workerRate) : 0;
      this.lastSeen = Number(saved.lastSeen) > 0 ? Number(saved.lastSeen) : 0;
      this.cash = Number(saved.cash) || 0;
      this.unlocked = { ...(saved.unlocked || {}) };
      this.paid = { ...(saved.paid || {}) };
      this.areas = Array.isArray(saved.areas) && saved.areas.length ? [...saved.areas] : [content.firstArea];
      this.tutorialDone = !!saved.tutorialDone;
      // Costs can drop when the balance is retuned. A plot already paid past its new price would
      // otherwise have nothing left to pay and could never complete, so it counts as bought.
      for (const u of this.upgrades) {
        if (!this.unlocked[u.id] && (this.paid[u.id] || 0) >= u.cost) { this.unlocked[u.id] = true; this.paid[u.id] = u.cost; }
      }
      // v1 saves had no areas; any unlocked gate reopens its area.
      for (const u of this.upgrades) if (this.unlocked[u.id] && u.effect.type === 'area' && !this.areas.includes(u.effect.area)) this.areas.push(u.effect.area);
    }
  }

  toJSON() {
    return {
      v: SAVE_VERSION, cash: Math.floor(this.cash), unlocked: this.unlocked, paid: this.paid, areas: this.areas,
      tutorialDone: this.tutorialDone, workerRate: Math.round(this.workerRate * 100) / 100, lastSeen: this.lastSeen,
      ...(this.company ? { company: this.company.toJSON() } : {}),
    };
  }

  has(id) { return !!this.unlocked[id]; }
  areaOpen(id) { return this.areas.includes(id); }
  get(id) { return this.upgrades.find(u => u.id === id); }

  unlockedEffects(type) {
    return this.upgrades.filter(u => this.unlocked[u.id] && u.effect.type === type).map(u => u.effect);
  }

  get capacity() {
    return this.unlockedEffects('capacity').reduce((m, e) => Math.max(m, e.value), this.baseCapacity);
  }
  price(item) {
    const base = this.items[item]?.price || 0;
    return this.unlockedEffects('price').filter(e => e.item === item).reduce((p, e) => p * e.mult, base) * this.boost.price;
  }
  speed(recipe) {
    return this.unlockedEffects('speed').filter(e => e.recipe === recipe).reduce((p, e) => p * e.mult, 1) * this.boost.speed;
  }

  /**
   * Make every upgrade cost `scale` times its normal price. Each legacy star makes the next company a
   * little more expensive, so that selling the company leads to a bigger build and not a shorter one.
   * The normal price is kept on the upgrade as `base`; a scale of 1 leaves untouched data untouched.
   */
  scaleCosts(scale = 1) {
    this.costScale = scale;
    for (const u of this.upgrades) {
      if (scale === 1 && u.base == null) continue;
      const base = u.base ?? (u.base = u.cost);
      u.cost = scale === 1 ? base : roundCost(base * scale);
    }
  }

  addCash(n) { this.cash += n; }
  /** Pay `n` in one go. @returns false, and takes nothing, when there is not enough cash */
  spend(n) { if (!(n >= 0) || this.cash < n) return false; this.cash -= n; return true; }

  /** Next purchasable thing in an area (upgrades in order, then the gate), or null. */
  nextUpgrade(areaId) {
    return this.upgrades.find(u => u.area === areaId && !this.unlocked[u.id]) || null;
  }

  remaining(id) {
    const u = this.get(id);
    if (!u || this.unlocked[id]) return 0;
    return u.cost - (this.paid[id] || 0);
  }

  /** Move up to `amount` cash into an upgrade. Returns { paid, completed }. */
  payToward(id, amount) {
    const rem = this.remaining(id);
    if (rem <= 0) return { paid: 0, completed: false };
    const paid = Math.min(amount, rem, this.cash);
    if (paid <= 0) return { paid: 0, completed: false };
    this.cash -= paid;
    this.paid[id] = (this.paid[id] || 0) + paid;
    const completed = this.remaining(id) <= 0.0001;
    if (completed) {
      const u = this.get(id);
      this.unlocked[id] = true; this.paid[id] = u.cost;
      if (u.effect.type === 'area' && !this.areas.includes(u.effect.area)) this.areas.push(u.effect.area);
    }
    return { paid, completed };
  }
}

/** A stack of one item type carried by a character. */
export class Carry {
  constructor() { this.type = null; this.count = 0; }
  get empty() { return this.count === 0; }
  canTake(type, capacity) {
    return (this.type === null || this.type === type) && this.count < capacity;
  }
  take(type, capacity) {
    if (!this.canTake(type, capacity)) return false;
    this.type = type; this.count++;
    return true;
  }
  drop(type) {
    if (this.type !== type || this.count === 0) return false;
    this.count--;
    if (this.count === 0) this.type = null;
    return true;
  }
}
