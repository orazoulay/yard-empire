// The Research tab: what can be researched and what has been.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, empty, money, bar, chip, section, note, row } from './kit.js';
import { RESEARCH, CATEGORIES } from '../data/company.js';
import { modRows } from '../sim/hqview.js';

export class HqResearch {
  // --- Research -----------------------------------------------------------------------
  /** What is in force for the whole company right now, read from its modifiers: the sum of everything researched, hired and earned. */
  inForce() {
    const c = this.company, rows = modRows(c.mods, c);
    return section('In force now',
      rows.length ? h('div', { class: 'hq-rows' }, ...rows.map(r => row(r.name, r.value)))
        : empty('Nothing is in force yet. What your research adds up to is listed here: faster machines, higher prices, lower costs.'),
      rows.length ? note('Everything that counts together: research, managers, legacy stars and an event while it runs.') : null);
  }
  research() {
    const c = this.company, cash = this.game.econ.cash;
    return [this.inForce(), ...Object.entries(CATEGORIES).map(([id, cat]) => {
      const nodes = RESEARCH.filter(r => r.cat === id);
      if (!nodes.length) return null;
      return section(cat.name, ...nodes.map(r => {
        const st = c.researchState(r);
        const state = st.done ? 'done' : st.lock ? 'locked' : st.affordable ? 'ready' : '';
        const level = st.max > 1 ? ` · level ${st.level} of ${st.max}` : '';
        // A technology that is open but too dear shows how much of its price is already there.
        const saved = !st.done && !st.lock && !st.affordable ? Math.floor(Math.max(0, cash) / st.cost * 100) : null;
        return h('article', { class: 'hq-card research ' + state },
          h('div', { class: 'hq-research-text' }, h('h4', { text: r.name + level }), h('div', { class: 'hq-sub', text: r.desc }),
            saved == null ? null : h('div', { class: 'hq-afford' }, bar(saved / 100), h('span', { class: 'hq-sub', text: `You have ${saved}% of the price` }))),
          st.done ? chip('Done', 'good', 'check')
            : st.lock ? chip(st.lock, '', 'lock')
              : this.button_(money(st.cost), 'research-' + r.id, () => this.act('research', () => c.buyResearch(r.id) && r), { cls: 'primary', disabled: !st.affordable, exact: st.cost }));
      }));
    })];
  }
}
