// What the player sees, hears and feels when something happens: pop-ins and shock rings, the hooks stations and
// areas call (pickup, batch, built, hired, sale, payment), the cards and confetti for what the company reports, and feel().
import * as THREE from 'three';
import { RANKS, milestoneText } from '../data/company.js';
import { ITEMS } from '../data/areas.js';
import { fmt } from '../format.js';
import { MOMENTS, feelOf } from '../ui-logic.js';
import { EFFECT_ICON } from '../icons.js';

const SHOCK_RING = new THREE.RingGeometry(0.86, 1, 48);   // the shape of every ring that spreads over the ground (shock)
const OFFER_AFTER = 7;                   // seconds from a purchase to the offer of an account: the cards about it come first

/** The feedback of the Game. */
export class FeedbackMethods {
  /** Scale a freshly built object up from nothing with a little overshoot. */
  popIn(group, dur = 0.5) {
    group.scale.setScalar(0.01);
    this.tweens.push({ t: 0, dur, step: k => {
      const c1 = 1.70158, c3 = c1 + 1, e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);   // easeOutBack
      group.scale.setScalar(Math.max(0.01, e));
    } });
  }

  /** A ring that spreads over the ground from a point: something big just happened here. */
  shock(x, z, color = 0xffffff, size = 7) {
    // A few rings are made once and used again: a burst of purchases makes no garbage and uploads nothing.
    this.rings ||= [];
    let ring = this.rings.find(r => !r.visible);
    if (!ring) {
      ring = new THREE.Mesh(SHOCK_RING, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2; this.scene.add(ring); this.rings.push(ring);
    }
    ring.visible = true; ring.material.color.setHex(color); ring.position.set(x, 0.07, z); ring.updateMatrix();
    this.tweens.push({ t: 0, dur: 0.75, step: k => {
      ring.scale.setScalar(0.5 + (1 - Math.pow(1 - k, 3)) * size); ring.material.opacity = 0.9 * (1 - k);
      if (k >= 1) ring.visible = false;
    } });
  }

  onPickup(ch) {
    if (ch !== this.player) return;
    this.sfx.pickup(ch.carry.count); this.settings.buzz(6);
  }
  onDrop(ch) { if (ch === this.player) this.sfx.drop(); }
  onBatch(station, batches = 1) {
    this.company.batch(station.area, station.recipeId, batches);
    if (!this.near(station.x, station.z)) return;
    this.particles.emit({ x: station.x + 1.2, y: 1.9, z: station.z + 0.6 },
      { count: 5, color: ITEMS[station.recipe.output].mesh.color, speed: 2.2, up: 3.2, life: 0.55, size: 0.13 });
    const d = Math.hypot(station.x - this.player.pos.x, station.z - this.player.pos.z);
    if (d < 16) this.sfx.machine(1 - d / 16);
  }
  onBuilt(station) {
    this._blocks = null;
    this.popIn(station.group);
    this.shock(station.x, station.z + 0.9, 0xffffff, 8); this.punch = 1;   // the camera pushes in for a moment
    this.particles.emit({ x: station.x, y: 0.2, z: station.z + 1 },
      { count: 30, color: 0xffffff, speed: 7, up: 2.5, life: 0.7, size: 0.24, gravity: 4, spread: 2, ring: true });
  }
  onHired(worker) {
    this.shock(worker.pos.x, worker.pos.z, 0xfff3b0, 3.5); this.punch = 0.6;
    this.particles.emit({ x: worker.pos.x, y: 0.4, z: worker.pos.z },
      { count: 16, color: 0xfff3b0, speed: 3.5, up: 4, life: 0.6, size: 0.16, spread: 0.6 });
  }

  onSell(item, ch, shop) {
    // The company decides: sold for cash, or stocked in the warehouse for a running contract.
    const mine = ch === this.player, head = ch.headPos;
    const sale = this.company.sale(item, shop.area, mine), price = sale.price;
    // Pay for time away is measured at the normal price, not the market's: leaving at a high price must not pay it for hours.
    const normal = this.econ.price(item);
    shop.showSale(item, ch, !sale.stocked);   // the item slides over the counter; a coin jumps out of the till when it was paid for
    if (sale.stocked) {
      if (mine) { this.fx.sum('stored', head.clone().add(new THREE.Vector3(0.8, 0.6, 0)), 1); this.sfx.drop(); this.settings.buzz(6); }
      else this.meter.add(normal);   // what workers bring in counts toward the pay for time away, sold or stocked
      return;
    }
    this.hud.setCash(this.econ.cash);
    this.life.sold(shop);   // now and then a customer comes for what was sold
    if (mine) {
      this.fx.money(head, () => this.hud.bumpCash());
      this.fx.sum('cash', head.clone().add(new THREE.Vector3(0.8, 0.6, 0)), price);   // yard interface: sales in a row add up to one number
      this.sfx.cash(); this.settings.buzz(8);
    } else {
      this.meter.add(normal);   // only worker sales count toward offline earnings
      if (this.near(ch.pos.x, ch.pos.z)) this.fx.money(head, () => this.hud.bumpCash());
    }
    if (this.near(ch.pos.x, ch.pos.z)) {
      this.particles.emit({ x: ch.pos.x, y: 1.6, z: ch.pos.z + 1.2 }, { count: mine ? 4 : 2, color: 0xffe066, speed: 1.8, up: 4, life: 0.5, size: 0.11 });
    }
    this.refreshPlots();
  }
  onPay(plot, r) {
    this.hud.setCash(this.econ.cash);
    this.refreshPlots();
    const u = plot.upgrade;
    this.sfx.pay(1 - this.econ.remaining(u.id) / u.cost);
    if (!r.completed) return;
    const area = this.area(plot.area);
    this.feel(u.gate ? 'gate' : 'upgrade');
    this.particles.emit({ x: plot.x, y: 0.3, z: plot.z }, { count: 22, color: 0xffd23f, speed: 4, up: 6, life: 0.8, size: 0.16, spread: 1.5 });
    area.applyUpgrade(u, false);
    area.spawnNextPlot();
    this.hud.unlock({ symbol: EFFECT_ICON[u.effect.type], title: u.label, desc: u.desc, kicker: u.gate ? 'New area' : 'Unlocked' });
    this._views = null;
    this.company.refreshCosts(); this.company.sync();
    this.celebrate();
    this.save();
    this.offerIn = OFFER_AFTER;   // a guest who has just bought something has something to keep: the account is offered soon (accountOffer)
    if (!area.plot && this.areas.every(a => a.open && !a.plot)) {
      setTimeout(() => { this.hud.unlock({ icon: '🏆', title: 'Everything built!', desc: 'You own every yard on the map', kicker: 'Tycoon' }); this.feel('everything'); }, 3200);
    }
  }
  refreshPlots() { for (const a of this.areas) if (a.open && a.plot) a.plot.refresh(this.econ); }

  /** Turn what the company reports (founded, milestone, new rank, order ready) into cards, sound and confetti. */
  celebrate() {
    const events = this.company.takeEvents(), founding = events.some(e => e.type === 'founded');
    for (const e of events) {
      let card = null;
      if (founding && e.type !== 'founded') continue;   // one card for the founding, not three
      // What each event says; how it sounds, buzzes and shows is one table for the whole game (MOMENTS in js/ui-logic.js).
      if (e.type === 'founded') {
        card = { symbol: 'hq', title: 'Company founded', desc: `You are a ${RANKS[this.company.rank].name} now. Open your Headquarters at the top.`, kicker: 'New' };
      } else if (e.type === 'milestone') {
        const m = e.milestone;
        card = { title: milestoneText(m, fmt), desc: `+${m.xp} experience`, kicker: 'Milestone' };
      } else if (e.type === 'rank') {
        const r = RANKS[e.rank];
        card = { title: r.name, desc: 'You reached a new rank', kicker: 'Promoted' };
      } else if (e.type === 'ready') {
        if (this.company.mods.autoDeliver) continue;   // the Warehouse Manager is about to deliver it
        card = { title: 'Order ready', desc: `Deliver it to ${e.contract.client} in your Headquarters`, kicker: 'Contract' };
      } else if (e.type === 'delivered') {
        card = { title: `Delivered to ${e.contract.client}`, desc: `Your Warehouse Manager collected $${fmt(e.reward.cash)}`, kicker: 'Contract' };
        this.hud.setCash(this.econ.cash); this.hud.bumpCash();
      } else if (e.type === 'achievement') {
        const a = e.achievement;
        card = { title: a.name, desc: `${a.desc} · +${a.xp} experience`, kicker: 'Achievement' };
      } else if (e.type === 'goal') {
        card = { title: e.period === 'daily' ? 'Daily goal done' : 'Weekly goal done', desc: 'Collect your reward in the Headquarters', kicker: 'Goal' };
      } else if (e.type === 'site') {   // the building site (js/data/builds.js): it opened, a stage was finished, a build was finished
        card = { symbol: 'construction', title: 'The building site is open', desc: 'Build a house from what your yards make. See Construction in your Headquarters, or walk in through the opening in the store\'s east fence.', kicker: 'Building site' };
        this.showSite(false);
      } else if (e.type === 'stage') {
        card = { symbol: 'construction', title: e.stage.done, desc: `${e.build.name}: stage ${e.index + 1} of ${e.build.stages.length} is finished`, kicker: 'Building site' };
        this.showSite(false);
      } else if (e.type === 'built') {
        card = { symbol: 'construction', title: `${e.build.name} is finished`, desc: `+$${fmt(e.cash)} and +${fmt(e.xp)} experience`, kicker: 'Built' };
        this.hud.setCash(this.econ.cash); this.hud.bumpCash(); this.showSite(false);
      } else if (e.type === 'notice') card = e.card;   // more to do: hints, price alerts, rush orders, regular clients: the company words them itself
      if (!card) continue;
      if (MOMENTS[e.type]) this.feel(e.type);
      this.hud.unlock(card);
      if (this.hqOpen) this.hq.toast(`${card.kicker}: ${card.title}`, e.type);   // Headquarters: the kind of event picks the icon of the line
    }
  }

  onHqToggle(open) { this.hqOpen = open; this.sfx.click(); }

  /**
   * One moment, felt the way its size says (js/ui-logic.js, FEEL and MOMENTS): a sound, a buzz, confetti and,
   * for the big ones, the camera pushing in. Less motion turns the confetti and the push off by itself.
   */
  feel(moment) {
    const f = feelOf(moment);
    this.sfx[f.sound]?.();
    if (f.buzz) this.settings.buzz(f.buzz);
    if (f.confetti) this.fx.confetti(f.confetti);
    if (f.punch) this.punch = Math.max(this.punch, f.punch);
  }
}
