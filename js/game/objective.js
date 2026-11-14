// What the player should do next: the views of the stations the rules read, the jobs the workers have claimed, the
// objective the arrows lead to, and the words and the progress bar of the objective card.
import { ITEMS, reachOf } from '../data/areas.js';
import { chooseJob, busiestMachine, playerDest } from '../sim/jobs.js';
import { plotProgress, cardPlot, purchaseName } from '../ui-logic.js';
import { EFFECT_ICON } from '../icons.js';

/** The objective of the Game. */
export class ObjectiveMethods {
  stationViews() {
    if (this._views) return this._views;
    const out = [];
    for (const a of this.areas) if (a.open) for (const s of a.stations) {
      out.push({ id: s.id, area: a.id, x: s.x, z: s.z, station: s, machine: s.type === 'processor',
        provides: i => s.provides(i), accepts: i => s.accepts(i), wants: i => s.wants(i),
        // what a machine holds: the feeder keeps it from running dry (js/sim/jobs.js, stockShort)
        ...(s.sim ? { holds: i => s.sim.holds(i), batch: i => s.sim.batchOf(i), materials: s.sim.materials } : {}) });
    }
    return (this._views = out);
  }

  /** Jobs the workers are busy with, leaving out `except`: used so nobody doubles up on a job. */
  claims(except = null) {
    const out = [];
    for (const a of this.areas) if (a.open) for (const w of a.workers) { if (w !== except && w.job) out.push(w.claim); }
    return out;
  }
  /** True once some built station can take `item`; until then sources keep it on the ground. */
  itemHasUse(item) { return this.stationViews().some(v => v.station.wants(item)); }

  objective() {
    const p = this.player, views = this.stationViews();
    // nearest first, but anything in the yard the player is standing in beats other yards
    const here = this.playerArea.id;
    const score = o => Math.hypot(o.x - p.pos.x, o.z - p.pos.z) + (o.area === here ? 0 : 1000);
    const byDist = (a, b) => score(a) - score(b);
    if (p.carry.type) {
      const item = p.carry.type;
      // Deliver first, sell the surplus; with everything full the player may still unload on a machine.
      const dest = playerDest({ area: here, x: p.pos.x, z: p.pos.z }, views, item);
      return dest ? { mode: 'give', item, station: dest.station, zone: dest.station.zoneFor('give', item) } : null;
    }
    const plots = this.areas.filter(a => a.open && a.plot && this.econ.cash >= this.econ.remaining(a.plot.upgrade.id)).map(a => a.plot).sort(byDist);
    if (plots[0]) return { mode: 'pay', plot: plots[0], zone: plots[0] };
    // What a worker of this yard would fetch; if this yard has nothing to do (its supplier
    // next door is empty), fall back to the job of the yard before it, and so on.
    const claims = this.claims();   // the arrow does not send you after goods a worker is already fetching
    for (let i = this.areas.indexOf(this.playerArea); i >= 0; i--) {
      const area = this.areas[i];
      // fetchReach: the arrow never sends the player further than the yard next door
      const job = chooseJob({ area: area.id, fetchReach: reachOf(area.id), x: p.pos.x, z: p.pos.z, carry: p.carry }, views, area.cfg.workerJob, claims);
      if (job && job.from) return { mode: 'take', item: job.item, station: job.from.station, zone: job.from.station.zoneFor('take', job.item) };
      // Nothing to pick up right now, but a machine here is working: wait at its output rather
      // than walking off to another yard.
      if (area === this.playerArea) {
        const m = busiestMachine(views, area.id);
        if (m) return { mode: 'take', item: m.station.recipe.output, station: m.station, zone: m.station.zoneFor('take') };
      }
    }
    const src = views.find(v => v.station.type === 'source');
    return src ? { mode: 'take', item: src.station.item, station: src.station, zone: src.station.zoneFor('take') } : null;
  }
  describe(o) {
    if (!o) return { symbol: 'check', text: 'All done here' };
    if (o.mode === 'pay') return { symbol: EFFECT_ICON[o.plot.upgrade.effect.type] || 'upgrade', text: purchaseName(o.plot.upgrade.label).action };
    const it = ITEMS[o.item];
    if (o.mode === 'take') return { symbol: 'collect', text: 'Collect ' + it.label };
    if (o.station.type === 'shop') return { symbol: 'coin', text: 'Sell the ' + it.label };
    return { symbol: 'deliver', text: `Bring ${it.label} to the ${o.station.recipe.name.toLowerCase()}` };
  }
  updateObjectiveCard(o) {
    const card = this.tutorial.active ? this.tutorial.card() : this.describe(o);
    // The purchase the card counts toward: the one the arrows lead to, this yard's next, or the nearest in price in another open yard.
    const plot = this.tutorial.active ? null : cardPlot({
      pay: o?.mode === 'pay' ? o.plot : null, here: this.playerArea.plot,
      plots: this.areas.filter(a => a.open && a.plot).map(a => ({ plot: a.plot, remaining: this.econ.remaining(a.plot.upgrade.id) })),
    });
    if (plot) {
      const u = plot.upgrade;   // how far the money for this yard's next purchase is, as a bar and in words
      Object.assign(card, plotProgress({ label: purchaseName(u.label).short, cash: this.econ.cash, remaining: this.econ.remaining(u.id), cost: u.cost }));
    }
    this.hud.setObjective(card);
  }
}
