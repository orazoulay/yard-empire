// The Market tab: what goods sell for now against normal, with a price chart for each.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, s, money, exact, amount, figure, ago, bar, label, yardName, cap, chip, marked, note, row } from './kit.js';
import { MARKET } from '../data/company.js';
import { Series } from '../sim/series.js';
import { exactMoney, isShortened } from '../sim/hqview.js';

export class HqMarket {
  // --- Market ------------------------------------------------------------------------------
  // What the goods of Commercial Metropolis sell for right now, against their normal price, with the
  // last half hour of prices. Every figure comes from the company (marketReport) and the market itself.
  market() {
    const c = this.company, m = c.market, econ = this.game.econ, log = this.priceLog();
    const band = Math.round(MARKET.band * 100), wait = Math.max(1, Math.ceil(m.nextIn));
    // Metropolis machines get their materials by truck: say so while a route into an open yard is still to buy.
    const routes = c.routeDefs.filter(d => !c.routes[d.id] && c.marketYards.includes(d.to) && econ.areaOpen(d.from) && econ.areaOpen(d.to));
    return [
      note(`Goods made in Commercial Metropolis are sold on its market. A price is never more than ${band}% above or below normal, and it always drifts back toward normal. Contracts and the pay for time away use the normal price.`),
      h('div', { class: 'hq-rows' }, row('New prices', `every ${MARKET.step} seconds of play`), row('Next prices in', `${wait} s`)),
      routes.length ? h('div', { class: 'hq-todo' }, marked('logistics', `Commercial Metropolis needs trucks: ${routes.length} route${routes.length === 1 ? '' : 's'} to buy`), this.button_('Logistics', 'go-logistics', () => this.go('logistics'))) : null,
      ...c.marketReport().map(r => this.marketCard(r, log)),
      note('Keeping a good in the warehouse takes it from the shop until the warehouse is full. Sell it here when the price is good.'),
    ];
  }
  /** One good on the market: price now, normal price, the difference, its history, and what the warehouse holds. */
  marketCard(r, log) {
    const c = this.company, name = cap(label(r.item));
    const tone = Math.abs(r.diff) < 0.0005 ? '' : r.diff > 0 ? 'good' : 'bad';
    const share = `${(Math.abs(r.diff) * 100).toFixed(1)}%`;
    const state = !tone ? chip('At the normal price', '', 'flat') : chip(`${share} ${r.diff > 0 ? 'above' : 'below'} normal`, tone, r.diff > 0 ? 'up' : 'down');
    return h('article', { class: 'hq-card market' },
      h('header', {}, h('h4', { text: name }), state),
      h('div', { class: 'hq-rows' },
        row('Price now', figure(r.price), tone),
        row('Normal price', figure(r.normal)),
        row('Difference', !tone ? 'none' : `${r.diff > 0 ? '+' : '−'}${share}`, tone)),
      this.priceChart(r, log),
      r.made
        ? h('div', { class: 'hq-need' }, h('span', { text: 'In the warehouse' }), bar(r.stock / c.capacity), h('b', { text: `${r.stock} / ${c.capacity}` }))
        : h('div', { class: 'hq-sub', text: `You do not make ${label(r.item)} yet. They come from the ${yardName(r.yard)}.` }),
      r.made ? h('div', { class: 'hq-actions' },
        this.button_(r.free > 0 ? `Sell ${r.free} for ${money(r.free * r.price)}` : 'Nothing to sell', 'sell-' + r.item, () => this.act('sell', () => c.sellStock(r.item)), { cls: 'primary', disabled: r.free <= 0, exact: r.free * r.price }),
        this.button_(`Keep in the warehouse: ${r.holding ? 'On' : 'Off'}`, 'hold-' + r.item, () => this.act('toggle', () => c.setHold(r.item, !r.holding)), { cls: r.holding ? '' : 'quiet' })) : null);
  }
  /**
   * The prices behind the charts: one sample per price step, kept in a Series like the Finance chart's.
   * It is filled from the market's own record, which gives the same prices for the same seed and time,
   * so the history is complete after a reload and nothing has to be sampled while the screen is closed.
   */
  priceLog() {
    const m = this.company.market;
    if (!this.prices || this.prices.seed !== m.seed || m.step < this.prices.step || m.step - this.prices.step > MARKET.history) {
      this.prices = { seed: m.seed, step: Math.max(-1, m.step - MARKET.history), series: new Series({ every: MARKET.step, keep: MARKET.history }) };
    }
    const p = this.prices;
    while (p.step < m.step) { const step = ++p.step; p.series.add(MARKET.step, () => m.factorsAt(step)); }
    return p.series;
  }
  /** The price of one good over the last half hour of play, on an axis that is the whole band: one line, read with a crosshair. */
  priceChart(r, log) {
    const pts = log.points, item = r.item, name = label(item), band = MARKET.band;
    if (pts.length < 2) return h('div', { class: 'fin-chart' }, h('p', { class: 'fin-empty', text: `The market has just opened. The price history of ${name} starts with the next prices.` }));
    const W = Math.max(220, Math.round(this.body.clientWidth - 86)), H = 108, L = 46, R = 6, T = 8, B = 22;   // the left margin holds the axis figures
    const first = pts[0], last = pts[pts.length - 1], span = last.t - first.t;
    const x = t => L + (t - first.t) / span * (W - L - R), y = f => T + (1 + band - f) / (2 * band) * (H - B - T);
    const fix = n => Math.round(n * 10) / 10;
    const svg = s('svg', { class: 'fin-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H },
      [1 + band, 1, 1 - band].map(f => s('line', { class: 'fin-grid' + (f === 1 ? ' base' : ''), x1: L, x2: W - R, y1: fix(y(f)), y2: fix(y(f)) })),
      [1 + band, 1, 1 - band].map(f => s('text', { class: 'fin-axis', x: L - 8, y: fix(y(f) + 4), 'text-anchor': 'end', text: money(r.normal * f) }, isShortened(r.normal * f) ? s('title', { text: exactMoney(r.normal * f) }) : null)),
      s('text', { class: 'fin-axis', x: L, y: H - 6, text: ago(span) }),
      s('text', { class: 'fin-axis', x: W - R, y: H - 6, 'text-anchor': 'end', text: 'now' }),
      s('polyline', { class: 'fin-line income', points: pts.map(p => `${fix(x(p.t))},${fix(y(p[item]))}`).join(' ') }),
      s('circle', { class: 'fin-end income', cx: fix(x(last.t)), cy: fix(y(last[item])), r: 3.5 }));
    const cross = s('line', { class: 'fin-cross', y1: T, y2: H - B }), dot = s('circle', { class: 'fin-end income', r: 3.5 });
    svg.append(cross, dot);
    const tip = h('div', { class: 'fin-tip' });
    const signed = f => (Math.abs(f - 1) < 0.0005 ? 'normal' : `${f > 1 ? '+' : '−'}${(Math.abs(f - 1) * 100).toFixed(1)}%`);
    const nearest = f => { const at = first.t + f * span; return pts.reduce((b, p, i) => (Math.abs(p.t - at) < Math.abs(pts[b].t - at) ? i : b), 0); };
    // Where a price chart is being read: { item, at } with at from 0 (oldest) to 1 (now). One chart at a time, kept across redraws.
    const at = () => (this.priceAt?.item === item ? this.priceAt.at : null);
    const place = () => {
      const on = at() != null;
      for (const el of [cross, dot]) el.style.display = on ? '' : 'none';
      tip.hidden = !on;
      if (!on) return;
      const p = pts[nearest(at())], px = fix(x(p.t));
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      dot.setAttribute('cx', px); dot.setAttribute('cy', fix(y(p[item])));
      tip.replaceChildren(h('div', { class: 'fin-tip-time', text: ago(last.t - p.t) }),
        h('div', { class: 'fin-tip-row' }, h('i', { class: 'fin-key income' }), h('b', {}, amount(r.normal * p[item])), h('span', { text: signed(p[item]) })));
      const leftSide = px > W / 2;   // keep the readout inside the chart
      tip.style.left = leftSide ? '' : (px + 10) + 'px';
      tip.style.right = leftSide ? (W - px + 10) + 'px' : '';
    };
    const aim = e => { const b = svg.getBoundingClientRect(); this.priceAt = { item, at: Math.max(0, Math.min(1, ((e.clientX - b.left) * (W / b.width) - L) / (W - L - R))) }; place(); };
    const step = by => { const i = Math.max(0, Math.min(pts.length - 1, nearest(at() ?? 1) + by)); this.priceAt = { item, at: (pts[i].t - first.t) / span }; place(); };
    const low = Math.min(...pts.map(p => p[item])), high = Math.max(...pts.map(p => p[item]));
    const plot = h('div', { class: 'fin-plot', tabindex: '0', role: 'group', 'data-key': 'price-chart-' + item,
      'aria-label': `Price of ${name}, last ${ago(span).replace(' ago', '')} of play. Now ${exactMoney(r.price)}, normal ${exactMoney(r.normal)}, lowest ${exactMoney(r.normal * low)}, highest ${exactMoney(r.normal * high)}. The left and right arrow keys read earlier prices.`,
      onpointermove: aim, onpointerdown: aim, onpointerleave: () => { if (at() != null) { this.priceAt = null; place(); } },
      onfocus: () => { if (at() == null) { this.priceAt = { item, at: 1 }; place(); } },
      onblur: () => { if (plot.isConnected && at() != null) { this.priceAt = null; place(); } },
      onkeydown: e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } } }, svg, tip);
    place();
    return h('div', { class: 'fin-chart' }, plot);
  }
}
