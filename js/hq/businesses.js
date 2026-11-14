// The Businesses tab: one card per yard with its profit trend.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, s, empty, aMinute, amount, bar, rate, note } from './kit.js';
import { AREAS } from '../data/areas.js';
import { icon } from '../icons.js';
import { exactMoney, orderYards, sparkLine } from '../sim/hqview.js';

export class HqBusinesses {
  // --- Businesses ----------------------------------------------------------------
  /**
   * One yard's profit over the last ten minutes of play as a small line: above the zero mark it earns,
   * below it loses. Drawn from the history sample() keeps; nothing until there are two samples.
   */
  trend(id) {
    const all = this.yardHistory?.points || [], newest = all[all.length - 1], W = 120, H = 28;
    if (!newest) return null;
    // The line only changes with a new sample, every five seconds: it is worked out then and reused by the redraws in between.
    const kept = (this.trends ||= new Map());
    let c = kept.get(id);
    if (!c || c.t !== newest.t) {
      const pts = all.filter(p => p[id] != null);   // a yard opened later has a shorter history
      c = { t: newest.t, line: null };
      if (pts.length >= 2) {
        const first = pts[0], last = pts[pts.length - 1];
        c.line = sparkLine(pts.map(p => p[id]), W, H);
        c.minutes = Math.max(1, Math.round((last.t - first.t) / 60));
        c.tone = last[id] < 0 ? 'down' : 'up';
        c.text = `Profit over the last ${c.minutes} min: from ${exactMoney(aMinute(first[id]))} to ${exactMoney(aMinute(last[id]))} a minute`;
      }
      kept.set(id, c);
    }
    if (!c.line) return null;
    return { minutes: c.minutes, svg: s('svg', { class: 'hq-spark ' + c.tone, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': c.text },
      s('title', { text: c.text }), s('line', { class: 'hq-spark-zero', x1: 0, x2: W, y1: c.line.zero, y2: c.line.zero }), s('polyline', { points: c.line.points })) };
  }
  businesses() {
    const c = this.company, econ = this.game.econ, p = this.prefs;
    const measuring = c.age < 45;   // the per-minute figures need a little while after loading
    const open = AREAS.filter(a => econ.areaOpen(a.id)).map(a => { const r = c.yardReport(a.id); return { a, r, name: a.name, profit: r.profit }; });
    const shown = orderYards(open, p.yards).filter(y => !p.losing || (y.profit < 0 && !measuring));
    const controls = h('div', { class: 'hq-controls' },
      this.choice('yards-by', 'Order the yards by', [['built', 'Build order'], ['profit', 'Profit'], ['name', 'Name']], p.yards, v => this.setPref('yards', v)),
      this.switch_('Losing money only', 'yards-losing', p.losing, () => this.setPref('losing', !this.prefs.losing)));
    const cards = shown.map(({ a, r }) => {
      const next = econ.nextUpgrade(a.id), trend = this.trend(a.id);
      const idle = r.income < 0.01, loss = r.profit < 0 && !measuring;
      const status = measuring ? ['Measuring…', ''] : idle && r.total < 0.01 ? ['Starting up', ''] : loss ? ['Losing money', 'bad'] : ['Profitable', 'good'];
      const costName = { materials: 'materials', wages: 'wages', upkeep: 'machine upkeep' }[r.biggest];
      const scale = Math.max(r.income, r.total, 1e-9);
      return h('article', { class: 'hq-card' },
        h('header', {}, h('h4', { text: a.name }), h('span', { class: 'hq-chip ' + status[1], text: status[0] })),
        h('div', { class: 'hq-sub', text: `${r.workers} worker${r.workers === 1 ? '' : 's'} · ${r.machines} machine${r.machines === 1 ? '' : 's'}` }),
        h('div', { class: 'hq-bars' },
          h('div', { class: 'hq-bar-row' }, h('span', { text: 'Income' }), bar(r.income / scale, 'income'), h('b', {}, rate(r.income))),
          h('div', { class: 'hq-bar-row' }, h('span', { text: 'Costs' }), bar(r.total / scale, 'costs'), h('b', {}, rate(r.total)))),
        h('div', { class: 'hq-row hq-trend ' + (loss ? 'bad' : r.profit > 0 && !measuring ? 'good' : '') },
          h('span', {}, 'Profit', trend && h('span', { class: 'hq-trend-span', text: ` · last ${trend.minutes} min` })), trend?.svg, h('b', {}, rate(r.profit))),
        h('div', { class: 'hq-split' },
          r.supplied > 0.01 ? h('span', {}, 'Supplies other yards: ', rate(r.supplied)) : null,
          r.stocked > 0.01 ? h('span', {}, 'To the warehouse: ', rate(r.stocked)) : null,
          r.site > 0.01 ? h('span', {}, 'To the building site: ', rate(r.site)) : null,
          r.costs.materials > 0.01 ? h('span', {}, 'Materials: ', rate(r.costs.materials)) : null,
          h('span', {}, 'Wages: ', rate(r.costs.wages)),
          h('span', {}, 'Upkeep: ', rate(r.costs.upkeep))),
        loss && !idle ? note(`This yard costs more than it brings in. Its largest cost is ${costName}.`) : null,
        loss && idle && r.total > 0.01 ? note('Nothing sold here in the last minute, but wages and upkeep are still paid.') : null,
        next ? h('div', { class: 'hq-next' },
          h('span', { text: `Next: ${next.label}` }),
          bar((next.cost - econ.remaining(next.id)) / next.cost),
          h('b', {}, amount(next.cost))) : h('div', { class: 'hq-next done' }, icon('check'), h('span', { text: 'Fully built' })));
    });
    const locked = AREAS.length - open.length;
    return [controls, ...cards,
      cards.length ? null : empty('No yard is losing money. A yard that costs more than it brings in is listed here.', this.button_('Show all yards', 'yards-all', () => this.setPref('losing', false))),
      locked ? note(`${locked} more yard${locked === 1 ? '' : 's'} to open. Walk to a yard's gate to expand.`) : null];
  }
}
