// The Finance tab: income, costs and value, and the chart of the last ten minutes of play.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { HISTORY, h, s, empty, money, aMinute, amount, figure, ago, rate, kpi, sub, note } from './kit.js';
import { AREAS } from '../data/areas.js';
import { niceMax } from '../sim/series.js';
import { icon } from '../icons.js';
import { exactMoney, isShortened, lastSeconds, thin, incomeRows } from '../sim/hqview.js';

export class HqFinance {
  // --- Finance ----------------------------------------------------------------------------
  // Figures with their unit set smaller, hairline tables, and a chart of the last ten minutes of play.
  finance() {
    const c = this.company, econ = this.game.econ, sm = c.summary();
    const before = this.history.ago(60);   // a minute of play earlier, for the trends
    const trend = (now, then) => {
      if (then == null) return sub();
      const base = Math.abs(then), pct = base > 1e-9 ? (now - then) / base : 0, size = Math.abs(pct) * 100;
      const dir = size < 0.1 ? 'flat' : pct > 0 ? 'up' : 'down';
      return sub(icon(dir), h('span', { text: dir === 'flat' ? 'steady this minute' : `${size >= 10 ? Math.round(size) : size.toFixed(1)}% in a minute` }));
    };
    const frow = (name, value, cls = '') => h('div', { class: 'fin-row ' + cls }, h('span', { class: 'fin-name', text: name }), value);
    const fsection = (title, ...kids) => h('section', { class: 'fin-section' }, h('h3', { text: title }), ...kids);
    const costs = [['Wages', sm.wages], ['Salaries', sm.salaries], ['Machine upkeep', sm.upkeep], ['Trucks', sm.transport]];
    const yards = AREAS.filter(a => econ.areaOpen(a.id)).map(a => {
      const r = c.yardReport(a.id);
      const invested = a.upgrades.reduce((sum, u) => sum + (econ.paid[u.id] || 0), 0);
      return { name: a.name, r, invested };
    }).sort((x, y) => y.r.profit - x.r.profit);
    const span = min => (min >= 120 ? `${Math.round(min / 60)} h` : `${Math.max(1, Math.round(min))} min`);
    const most = Math.max(1e-9, ...yards.map(y => Math.abs(y.r.profit)));
    const payback = y => (y.r.profit > 0.001 && y.invested > 0 ? `pays back in ${span(y.invested / y.r.profit / 60)}` : y.r.profit <= 0 ? 'not paying back' : '');
    // Where the cash comes from: each yard's own sales, and what deliveries and the warehouse brought in.
    const sources = incomeRows(yards.map(y => ({ name: y.name, sales: y.r.sales })), sm.income), quiet = yards.filter(y => !(y.r.sales > 0)).length;
    return [
      h('div', { class: 'fin-kpis' },
        kpi('Income', aMinute(sm.income), '/min', trend(sm.income, before?.income)),
        kpi('Costs', aMinute(sm.costs), '/min', trend(sm.costs, before?.costs)),
        kpi('Profit', aMinute(sm.profit), '/min', sm.income > 0.001 ? sub(h('span', { text: `${Math.round(sm.profit / sm.income * 100)}% of income` })) : sub(), sm.profit < 0 ? 'down' : 'up'),
        kpi('Company value', sm.valuation, '', trend(sm.valuation, before?.value))),
      h('div', { class: 'hq-controls' }, h('span', { class: 'hq-sub', text: 'The charts show the last' }),
        this.choice('range', 'Time the charts show', [[120, '2 min'], [600, '10 min']], this.prefs.range, v => this.setPref('range', v))),
      this.chart({ key: 'flow', title: 'Income and costs per minute', series: [[p => p.income, 'Income', 'income'], [p => p.costs, 'Costs', 'costs']], per: 60, profit: true }),
      this.chart({ key: 'value', title: 'Company value gained in this time', series: [[(p, first) => p.value - first.value, 'Gained', 'income']] }),
      fsection('Where the money comes from',
        sources.length ? h('div', { class: 'fin-panel cols' }, ...sources.map(r => h('div', { class: 'fin-row share source' },
          h('span', { class: 'fin-name', text: r.other ? 'Contracts and warehouse' : r.name }), h('span', { class: 'fin-share' }, h('i', { width: r.share })),
          h('span', { class: 'fin-pct', text: Math.round(r.share * 100) + '%' }), rate(r.value))))
          : empty('No cash came in during the last minute. Every yard that sells is listed here with its share.'),
        sources.length && quiet ? note(`${quiet} yard${quiet === 1 ? ' sells' : 's sell'} nothing in a shop right now: what ${quiet === 1 ? 'it makes' : 'they make'} goes to other yards or to the warehouse.`) : null),
      fsection('Where the money goes',
        h('div', { class: 'fin-panel cols' }, ...costs.map(([name, v]) => {
          const share = sm.costs > 0 ? v / sm.costs : 0;
          return h('div', { class: 'fin-row share' }, h('span', { class: 'fin-name', text: name }), h('span', { class: 'fin-share' }, h('i', { width: share })),
            h('span', { class: 'fin-pct', text: Math.round(share * 100) + '%' }), rate(v));
        }))),
      fsection('What the company is worth',
        h('div', { class: 'fin-panel' }, frow('Cash', figure(econ.cash)), frow('Invested in yards, research and routes', figure(sm.invested)),
          frow('Ten minutes of profit', figure(Math.max(0, sm.profit) * 600)), frow('Company value', figure(sm.valuation), 'total'))),
      fsection('Since the beginning',
        h('div', { class: 'fin-panel' }, frow('Earned', figure(c.stats.income)), frow('Paid in wages, salaries, upkeep and trucks', figure(c.stats.costs)))),
      fsection('Yards by profit',
        h('div', { class: 'fin-panel cols three' }, ...yards.map(y => h('div', { class: 'fin-row yard' + (y.r.profit < 0 ? ' down' : '') },
          h('span', { class: 'fin-yard' }, h('span', { class: 'fin-name', text: y.name }), h('span', { class: 'fin-sub', text: payback(y) })),
          h('span', { class: 'fin-share' }, h('i', { width: Math.abs(y.r.profit) / most })),   // how it compares with the best yard
          rate(y.r.profit))))),
    ];
  }

  /**
   * A line chart of the last two or ten minutes of play (the player's choice), read with a crosshair by
   * mouse, touch or arrow keys. Under it, on request, the same numbers as a table for who cannot use the chart.
   * @param key     a name for this chart, to tell the charts on one tab apart
   * @param series  the lines: [value(sample, firstSample), name, style], style being a line colour of the stylesheet
   * @param per     what to multiply by for display: 60 turns a rate per second into dollars a minute
   * @param profit  also show the first line minus the second in the readout
   */
  chart({ key, title, series, per = 1, profit = false }) {
    const pts = lastSeconds(this.history.points, this.prefs?.range || HISTORY.every * HISTORY.keep), show = v => money(Math.round(v * per));
    const full = v => exactMoney(Math.round(v * per));
    if (pts.length < 2) {
      const left = Math.ceil(HISTORY.warmup + 2 * HISTORY.every - this.company.age);
      return h('section', { class: 'fin-section' }, h('h3', { text: title }),
        h('div', { class: 'fin-panel fin-chart' }, h('p', { class: 'fin-empty', text: `The chart draws itself while the yards work. First line in ${left > 1 ? `about ${left} seconds` : 'a moment'}.` })));
    }
    const first = pts[0], last = pts[pts.length - 1], span = last.t - first.t;
    const rows = pts.map(p => series.map(([value]) => value(p, first)));   // rows[i][k]: line k at sample i
    const W = Math.max(240, Math.round(this.body.clientWidth - 58)), H = 150, L = 44, R = 6, T = 10, B = 24;   // the left margin holds the axis figures
    const all = rows.flat(), high = niceMax(Math.max(0, ...all) * per) / per, low = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(...all) * per) / per : 0;
    const x = t => L + (t - first.t) / span * (W - L - R), y = v => H - B - (Math.max(low, Math.min(high, v)) - low) / (high - low) * (H - B - T);
    const fix = n => Math.round(n * 10) / 10;
    const marks = low < 0 ? [high, 0, low] : [high, high / 2, 0];
    const svg = s('svg', { class: 'fin-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H },
      marks.map(v => s('line', { class: 'fin-grid' + (v === 0 ? ' base' : ''), x1: L, x2: W - R, y1: fix(y(v)), y2: fix(y(v)) })),
      marks.map(v => s('text', { class: 'fin-axis', x: L - 8, y: fix(y(v) + 4), 'text-anchor': 'end', text: show(v) }, isShortened(v * per) ? s('title', { text: full(v) }) : null)),
      s('text', { class: 'fin-axis', x: L, y: H - 7, text: ago(span) }),
      s('text', { class: 'fin-axis', x: W - R, y: H - 7, 'text-anchor': 'end', text: 'now' }),
      series.map(([, , style], k) => s('polyline', { class: 'fin-line ' + style, points: pts.map((p, i) => `${fix(x(p.t))},${fix(y(rows[i][k]))}`).join(' ') })),
      series.map(([, , style], k) => s('circle', { class: 'fin-end ' + style, cx: fix(x(last.t)), cy: fix(y(rows[rows.length - 1][k])), r: 3.5 })));
    const cross = s('line', { class: 'fin-cross', y1: T, y2: H - B });
    const dots = series.map(([, , style]) => s('circle', { class: 'fin-end ' + style, r: 3.5 }));
    svg.append(cross, ...dots);
    const tip = h('div', { class: 'fin-tip' });
    const at = () => (this.chartAt && this.chartAt.key === key ? this.chartAt.f : null);
    const nearest = f => { const want = first.t + f * span; return pts.reduce((best, p, i) => (Math.abs(p.t - want) < Math.abs(pts[best].t - want) ? i : best), 0); };
    const place = () => {
      const f = at(), on = f != null;
      for (const el of [cross, ...dots]) el.style.display = on ? '' : 'none';
      tip.hidden = !on;
      if (!on) return;
      const i = nearest(f), px = fix(x(pts[i].t));
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      series.forEach((line, k) => { dots[k].setAttribute('cx', px); dots[k].setAttribute('cy', fix(y(rows[i][k]))); });
      tip.replaceChildren(h('div', { class: 'fin-tip-time', text: ago(last.t - pts[i].t) }),
        ...series.map(([, name, style], k) => h('div', { class: 'fin-tip-row' }, h('i', { class: 'fin-key ' + style }), h('b', {}, amount(Math.round(rows[i][k] * per))), h('span', { text: name }))),
        profit ? h('div', { class: 'fin-tip-row' }, h('i', { class: 'fin-key' }), h('b', {}, amount(Math.round((rows[i][0] - rows[i][1]) * per))), h('span', { text: 'Profit' })) : null);
      const leftSide = px > W / 2;   // keep the readout inside the chart
      tip.style.left = leftSide ? '' : (px + 10) + 'px';
      tip.style.right = leftSide ? (W - px + 10) + 'px' : '';
    };
    const read = f => { this.chartAt = f == null ? null : { key, f }; place(); };
    const aim = e => { const b = svg.getBoundingClientRect(); read(Math.max(0, Math.min(1, ((e.clientX - b.left) * (W / b.width) - L) / (W - L - R)))); };
    const step = by => { const i = Math.max(0, Math.min(pts.length - 1, nearest(at() ?? 1) + by)); read((pts[i].t - first.t) / span); };
    const now = rows[rows.length - 1];
    const plot = h('div', { class: 'fin-plot', tabindex: '0', role: 'group', 'data-key': 'chart-' + key,
      'aria-label': `${title}, last ${ago(span).replace(' ago', '')} of play. ${series.map(([, name], k) => `${name} now ${full(now[k])}`).join(', ')}. The left and right arrow keys read earlier values.`,
      onpointermove: aim, onpointerdown: aim, onpointerleave: () => read(null),
      onfocus: () => { if (at() == null) read(1); },
      onblur: () => { if (plot.isConnected) read(null); },
      onkeydown: e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } } }, svg, tip);
    place();
    // The same numbers as a table, newest first: about one row a minute for ten minutes, one every 15 seconds for two.
    const tables = (this.tables ||= {}), open = !!tables[key], cols = [...series.map(([, name]) => name), ...(profit ? ['Profit'] : [])];
    const toggle = this.button_(open ? 'Hide the table' : 'Show the numbers as a table', 'table-' + key, () => { tables[key] = !tables[key]; this.render(); }, { cls: 'quiet small' });
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const table = open ? h('div', { class: 'fin-panel fin-table' }, h('table', {},
      h('caption', { class: 'hq-sr', text: title }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'When' }), ...cols.map(name => h('th', { scope: 'col', text: name })))),
      h('tbody', {}, ...thin(pts.map((p, i) => i)).reverse().map(i => h('tr', {}, h('th', { scope: 'row', text: ago(last.t - pts[i].t) }),
        ...series.map((line, k) => h('td', {}, amount(Math.round(rows[i][k] * per)))),
        profit ? h('td', {}, amount(Math.round((rows[i][0] - rows[i][1]) * per))) : null))))) : null;
    return h('section', { class: 'fin-section' },
      h('header', { class: 'fin-chart-head' }, h('h3', { text: title }),
        series.length > 1 ? h('div', { class: 'fin-legend' }, ...series.map(([, name, style]) => h('span', {}, h('i', { class: 'fin-key ' + style }), h('span', { text: name })))) : null),
      h('div', { class: 'fin-panel fin-chart' }, plot), toggle, table);
  }
}
