// The Port tab: each ship with what is in its hold and what it will pay, the destinations with their time and premium,
// Send and Unload, the goods marked for export, the refits, and three steps that lead a first voyage.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
// Every figure comes from the company (Company.portReport); every button calls one of its rules through act().
import { h, money, withAmount, amount, bar, cap, chip, section, note } from './kit.js';
import { icon } from '../icons.js';
import { fmt } from '../format.js';
import { clockText } from '../sim/company.js';
import { portHoldText } from '../sim/hqview.js';

const pct = share => `+${Math.round(share * 100)}%`;

export class HqPort {
  // --- Port ----------------------------------------------------------------------------------
  port() {
    const r = this.company.portReport(), two = r.ships.length > 1;
    const goods = r.goods.filter(g => g.open);
    return [
      this.portHold(r),
      this.portSteps(r.steps),
      section(two ? 'Your ships' : 'Your ship', ...(r.ships.length ? r.ships.map(s => this.shipCard(s, r.routes, two))
        : [note('Buy the cargo ship at the Port. It lies at the quay and carries your goods overseas, for more than the shops pay.')]),
        r.boosted && r.ships.length ? note('Your price boost does not reach a ship\'s cargo. Goods sold at the shops get it.') : null),
      section('Goods for export', ...(goods.length ? goods.map(g => this.exportRow(g, r.ships.length > 0))
        : [note('None of the yards that make goods for export is open yet.')]),
      note('Marked goods go aboard while a ship is at the quay with room. The rest is sold as always.')),
      section('Refits', ...this.refitCards(r)),
    ];
  }
  /**
   * One line, only while a good the Port waits for is not being made because a running build comes first: ship parts
   * for the refit that runs, or a good marked for export, made by a yard of the region that stands still for the site.
   */
  portHold(r) {
    const c = this.company, holds = c.siteHolds();
    if (!holds.yards.length) return null;
    const waited = new Set(r.goods.filter(g => g.marked).map(g => g.item));
    if (c.port.refit.at) waited.add('shippart');
    const stopped = r.goods.map(g => g.item).filter(item => waited.has(item) && holds.yards.includes(c.maker[item]));   // in the order of the tab's goods
    if (!stopped.length) return null;
    return h('p', { class: 'hq-note hq-sale-line warn' }, icon('clock'),
      h('span', { text: portHoldText(stopped.map(item => c.items[item].label), holds.items.map(item => c.items[item].label)) }));
  }
  /** The three steps of a first voyage, as the Overview's first steps: a track of three and the next one. Gone once all are done. */
  portSteps(steps) {
    const done = steps.filter(s => s[2]).length, next = steps.findIndex(s => !s[2]);
    if (next < 0) return null;
    const [name, why] = steps[next];
    return section(`First voyage · ${done} of ${steps.length}`, h('article', { class: 'hq-card hq-step' },
      h('div', { class: 'hq-step-track', role: 'img', 'aria-label': `${done} of ${steps.length} steps done` },
        ...steps.map((st, i) => h('span', { class: st[2] ? 'done' : i === next ? 'next' : '' }))),
      h('h4', { text: name }),
      h('div', { class: 'hq-sub', text: why }),
      done ? h('div', { class: 'hq-sub hq-step-done', text: 'Done: ' + steps.filter(st => st[2]).map(st => st[0]).join(', ') }) : null));
  }
  /** One ship: at the quay with its hold, a destination to choose, Send and Unload; or at sea, with the time left and its sum. */
  shipCard(s, routes, two) {
    const c = this.company, name = two ? `Ship ${s.index + 1}` : 'Cargo ship';
    if (s.atSea) {
      const to = routes.find(x => x.id === s.route)?.name || 'its destination';
      return h('article', { class: 'hq-card hq-ship sea' },
        h('header', {}, h('h4', { text: name }), chip(`At sea · ${to}`, 'good')),   // "to Across the ocean" would not read: the destination stands on its own
        h('div', { class: 'hq-need' }, h('span', { text: 'Voyage' }), bar(s.total > 0 ? 1 - s.left / s.total : 1), h('b', { text: `${clockText(s.left)} left` })),
        h('div', { class: 'hq-sub' }, ...withAmount(`Pays ${money(s.pay)} when it is back`, s.pay)));
    }
    const open = routes.filter(x => x.open);
    // The destination chosen for a ship at the quay is the screen's own, as a chart being read is: it starts from where the ship sailed last.
    this.portRoute ||= {};
    let at = this.portRoute[s.index] ?? s.next;
    if (!open.some(x => x.id === at)) at = open[0]?.id;
    const empty = s.aboard <= 0, full = s.aboard >= s.size, pays = at ? s.pays[at] : 0;
    const key = `unload-${s.index}`, arm = this.confirm === key;
    return h('article', { class: 'hq-card hq-ship' },
      h('header', {}, h('h4', { text: name }), chip(full ? 'At the quay · full' : 'At the quay', full ? 'good' : '')),
      h('div', { class: 'hq-need' }, h('span', { text: 'In the hold' }), bar(s.aboard / s.size, full ? 'good' : ''), h('b', { text: `${fmt(s.aboard)} of ${fmt(s.size)}` })),
      h('div', { class: 'hq-sub' }, ...(empty ? ['The hold is empty. Marked goods come aboard as they reach the shops, and you can carry goods to the quay yourself.']
        : withAmount(`Worth ${money(s.value)} at the shops`, s.value))),
      h('div', { class: 'hq-seg hq-routes', role: 'group', 'aria-label': `Destination of the ${name.toLowerCase()}` }, ...open.map(x =>
        h('button', { class: 'hq-seg-btn' + (x.id === at ? ' on' : ''), 'aria-pressed': x.id === at ? 'true' : 'false', 'data-key': `route-${s.index}-${x.id}`,
          'aria-label': `${x.name}, ${clockText(x.seconds)} there and back, ${pct(x.premium)} over the shops`,
          onclick: () => { this.portRoute[s.index] = x.id; this.render(); } },
        h('span', { text: x.name }), h('span', { class: 'hq-route-terms', text: `${clockText(x.seconds)} · ${pct(x.premium)}` })))),
      h('div', { class: 'hq-actions' },
        this.button_(empty ? 'Send' : `Send: +${money(pays)}`, `send-${s.index}`, () => this.act('sail', () => c.sendShip(s.index, at)),
          { cls: 'primary', disabled: empty || !at, exact: empty ? null : pays }),
        this.button_(arm ? `Tap again to unload for ${money(s.value)}` : 'Unload', key, () => {
          if (!arm) { this.confirm = key; this.render(); return; }
          this.act('unload', () => c.unloadShip(s.index));
        }, { cls: arm ? 'danger' : 'quiet', disabled: empty, exact: arm ? s.value : null })),
      arm ? note('Unloading sells the hold at the shops, without the premium of a voyage.') : null);
  }
  /** A good a ship takes: its normal price, and a switch that marks it for export. */
  exportRow(g, ships) {
    const sw = this.switch_(g.marked ? 'Export: On' : 'Export: Off', 'export-' + g.item, g.marked, () => this.act('export', () => this.company.setExport(g.item, !g.marked)));
    sw.setAttribute('aria-label', `Export ${g.label}`);   // with aria-pressed: "Export cars, on"
    if (!ships) sw.setAttribute('disabled', '');   // nothing to mark for before there is a ship
    return h('div', { class: 'hq-export' },
      h('div', { class: 'hq-export-text' }, h('b', { text: cap(g.label) }), h('span', { class: 'hq-sub' }, 'Normal price ', amount(g.price))),
      sw);
  }
  /** The refits of the ships: offered once the Shipyard is open, each with its price and what it still needs. */
  refitCards(r) {
    const c = this.company;
    if (!r.refitOpen) return [note('Open the Shipyard to refit your ships.')];
    return [...r.refits.map(({ refit, cost, given, state, afford }) => h('article', { class: 'hq-card research refit ' + (state === 'done' ? 'done' : state === 'later' ? 'locked' : 'ready') },
      h('div', { class: 'hq-research-text' }, h('h4', { text: refit.name }), h('div', { class: 'hq-sub', text: refit.desc }),
        state === 'done' ? null : h('div', { class: 'hq-sub' }, ...withAmount(`${money(cost)}, then ${fmt(refit.parts)} ship parts`, cost))),
      state === 'done' ? chip('Done', 'good', 'check')
        : state === 'running' ? h('div', { class: 'hq-need' }, h('span', { text: 'Ship parts' }), bar(given / refit.parts), h('b', { text: `${fmt(given)} of ${fmt(refit.parts)} ship parts` }))
          : state === 'ready' ? this.button_(`Start: ${money(cost)}`, 'refit-' + refit.id, () => this.act('refit', () => c.startRefit(refit.id)), { cls: 'primary', disabled: !afford, exact: cost })
            : chip('After the refit that is running', '', 'lock'))),
    note('A refit is paid when it starts. Then it takes the ship parts that reach the Shipyard\'s shop, after a contract and before a ship\'s hold.')];
  }
}
