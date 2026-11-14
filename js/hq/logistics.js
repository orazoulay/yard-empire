// The Logistics tab: the routes between yards and the trucks that run them.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, empty, money, bar, label, yardName, chip, marked, section, note, row } from './kit.js';
import { fmt } from '../format.js';
import { FINANCE } from '../data/company.js';
import { routesWithin } from '../sim/hqview.js';

export class HqLogistics {
  // --- Logistics ------------------------------------------------------------------------
  /** The routes that could be bought with the cash on hand, all together: not owned, not locked, cheapest first. */
  routesToBuy() {
    const c = this.company;
    return routesWithin(c.routeDefs.filter(d => { const st = c.routeState(d); return !st.owned && !st.lock; }), this.game.econ.cash);
  }
  /** Buy them all: the first press says what it will cost and asks again, the second one buys. */
  buyRoutes() {
    if (this.confirm !== 'routes-all') { this.confirm = 'routes-all'; this.render(); return; }
    this.act('route', () => this.routesToBuy().list.filter(d => this.company.buyRoute(d.id)).length || null);
  }
  logistics() {
    const c = this.company, econ = this.game.econ;
    const items = [...new Set([...Object.keys(c.stock), ...c.active.flatMap(x => x.needs.map(n => n[0]))])];
    const stock = items.map(item => {
      const have = c.stock[item] || 0, reserved = Math.min(c.reserved(item), have), free = have - reserved;
      return h('div', { class: 'hq-need' }, h('span', { text: label(item) }), bar(have / c.capacity), h('b', { text: `${have} / ${c.capacity}` }),
        free > 0 ? this.button_(`Sell ${free}`, 'sell-' + item, () => this.act('sell', () => c.sellStock(item)), { cls: 'small' }) : null);
    });
    // How long each running order still needs, from what the yards made in the last minute.
    const waits = c.active.flatMap(x => x.needs.map(([item, qty]) => {
      const missing = qty - Math.min(c.stock[item] || 0, qty);
      if (missing <= 0) return null;
      const yard = c.maker[item], r = c.yardReport(yard), perSec = (r.sales + r.stocked) / Math.max(econ.price(item), 1e-9);
      const text = perSec > 0.001 ? `about ${Math.max(1, Math.ceil(missing / perSec / 60))} min at the current pace` : `nothing is reaching the ${yardName(yard)} shop right now`;
      return h('div', { class: 'hq-row' }, h('span', { text: `${missing} more ${label(item)}` }), h('b', { text }));
    })).filter(Boolean);
    // The routes that can be bought, and the locked ones between yards that are open; the rest fold into one line until asked for.
    const defs = c.routeDefs.map(d => ({ d, st: c.routeState(d) })), every = !!this.unfold?.routes;
    const near = ({ d, st }) => !st.lock || (econ.areaOpen(d.from) && econ.areaOpen(d.to));
    const shown = every ? defs : defs.filter(near), hidden = defs.length - shown.length;
    const fold = hidden > 0 || every
      ? this.button_(every ? 'Show fewer routes' : `Show all ${defs.length} routes (${hidden} more, locked for now)`, 'routes-fold',
        () => { (this.unfold ||= {}).routes = !every; this.render(); }, { cls: 'quiet small' }) : null;
    const routes = shown.map(({ d, st }) => {
      return h('article', { class: 'hq-card research ' + (st.owned ? 'done' : st.lock ? 'locked' : st.affordable ? 'ready' : '') },
        h('div', { class: 'hq-research-text' },
          h('h4', { text: `${yardName(d.from)} → ${yardName(d.to)}` }),
          h('div', { class: 'hq-sub', text: st.owned ? `Carrying ${label(d.item)}: ${st.perMinute.toFixed(0)} a minute` : `Carries ${label(d.item)} to the machines, nobody has to walk` })),
        st.owned ? chip('Running', 'good', 'check')
          : st.lock ? chip(st.lock, '', 'lock')
            : this.button_(money(d.cost), 'route-' + d.id, () => this.act('route', () => c.buyRoute(d.id) && d), { cls: 'primary', disabled: !st.affordable, exact: d.cost }));
    });
    // One button for every route the cash covers, offered when that is more than one. It names the price, and asks again before it buys.
    const all = this.routesToBuy(), arm = this.confirm === 'routes-all', count = `${all.list.length} routes for ${money(all.total)}`;
    const buyAll = all.list.length > 1
      ? this.button_(arm ? `Tap again to buy ${count}` : `Buy ${count}`, 'routes-all', () => this.buyRoutes(), { cls: arm ? 'armed' : '', exact: all.total }) : null;
    const lab = c.tabLock('research');
    // Before Trucking: how many routes it opens, and the way there (the lab, or the first contract that opens the lab).
    const needsTrucking = c.mods.routes ? null : h('div', { class: 'hq-todo' },
      marked('research', lab ? `${defs.length} truck routes come with the Trucking research. ${lab}` : `${defs.length} truck routes need the Trucking technology`),
      lab ? (c.active.length ? null : this.button_('See offers', 'go-contracts', () => this.go('contracts')))
        : this.button_('Open lab', 'go-research', () => this.go('research')));
    return [
      section('Warehouse', note(`Holds up to ${c.capacity} of each item. Research makes it bigger.`),
        ...(stock.length ? stock : [empty('The warehouse is empty. Goods for a running contract collect here until the order is full.',
          c.active.length ? null : this.button_('See offers', 'go-contracts', () => this.go('contracts')))])),
      waits.length ? section('Still missing for your orders', ...waits) : null,
      section('Truck routes', note(`A truck takes finished goods from one yard to the machines of the next, for ${Math.round(FINANCE.transportShare * c.mods.truckFee * 1000) / 10}% of their price.`), needsTrucking, buyAll, ...routes, fold,
        c.stats.trucked ? row('Items trucked so far', fmt(c.stats.trucked)) : null),
    ];
  }
}
