// The Advisor tab: what holds each yard back, the rush orders and the market watch.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, bar, label, cap, section, note } from './kit.js';
import { MARKET, RUSH } from '../data/company.js';
import { AREAS } from '../data/areas.js';
import { icon } from '../icons.js';
import { clockText } from '../sim/company.js';
import { advise, ADVICE } from '../sim/advice.js';

export class HqAdvisor {
  // --- Advisor --------------------------------------------------------------------------------------------
  // One line per yard that is held back by something the player can change (js/sim/advice.js), the time of
  // the rush orders, and the market watch: alerts, the Sales Manager's switch and, once researched, the next prices.
  advisor() {
    const c = this.company, econ = this.game.econ, watch = this.game.watch;
    const KIND = { carriers: 'Nobody carrying', blocked: 'Goods pile up', starved: 'Waiting for material', loss: 'Losing money' };
    const tips = AREAS.filter(a => econ.areaOpen(a.id)).map(a => ({ a, tip: advise(c.yardFacts(a.id, watch?.read(a.id))) })).filter(x => x.tip);
    const settling = c.age < ADVICE.window;
    const cards = tips.map(({ a, tip }) => {
      const lock = tip.go === 'research' || tip.go === 'logistics' ? c.tabLock(tip.go) : null;
      const action = tip.go === 'logistics' ? this.button_('Logistics', 'advice-' + a.id, () => this.go('logistics'), { cls: 'primary' })
        : tip.go === 'research' && !lock ? this.button_('Open lab', 'advice-' + a.id, () => this.go('research'), { cls: 'primary' })
          : tip.go === 'yard' ? this.button_('Go there', 'advice-' + a.id, () => { if (this.game.travel(a.id)) this.close(); }) : null;
      return h('article', { class: 'hq-card advice' },
        h('header', {}, h('h4', { text: a.name }), h('span', { class: 'hq-chip ' + (tip.kind === 'loss' ? 'bad' : ''), text: KIND[tip.kind] })),
        h('div', { class: 'hq-goal-text', text: tip.problem }),
        h('div', { class: 'hq-sub', text: tip.fix }),
        action ? h('div', { class: 'hq-actions' }, action) : null);
    });
    return [
      note('The Advisor reads the last minute of every yard and names what holds it back, when there is something you can do about it.'),
      section(`Yards · ${tips.length ? `${tips.length} to look at` : 'nothing to report'}`, ...cards,
        tips.length ? null : note(settling ? 'Still reading the books. The first advice comes after about a minute of play.' : 'Every open yard runs as well as it can with what is built. Nothing holds one back that you could change right now.')),
      this.rushCard(),
      c.market.open ? this.marketWatch() : null,
    ];
  }
  /** Rush orders, offered and running: what is asked, how much time there is, and whether the yards will make it at their pace. */
  rushCard() {
    const c = this.company;
    const line = (x, running) => {
      const [item, qty] = x.needs[0], have = Math.min(c.stock[item] || 0, qty), need = c.fillTime(x);
      const late = running && !x.safe && need > x.left, state = running ? (x.safe || c.ready(x) ? 'in time' : `${clockText(x.left)} left`) : `${clockText(x.limit)} to deliver`;
      return h('div', { class: 'hq-goal' },
        h('span', { class: 'hq-goal-icon' }, icon('clock')),
        h('div', { class: 'hq-goal-body' },
          h('div', { class: 'hq-goal-text', text: `${x.client}: ${qty} ${label(item)}` }),
          running ? bar(have / qty) : null,
          h('div', { class: 'hq-sub ' + (late ? 'bad' : ''), text: running
            ? (need <= 0 ? 'The goods are in the warehouse. Deliver it on the Contracts tab.' : `${have} of ${qty} · about ${clockText(need)} more at the pace of the last minute${late ? ': carry some yourself, or it runs out' : ''}`)
            : `An offer on the Contracts tab. At the pace of the last minute the goods take about ${clockText(need)}.` })),
        h('span', { class: 'hq-chip ' + (late ? 'bad' : running && need <= 0 ? 'good' : ''), text: state }));
    };
    const lines = [...c.active.filter(x => x.limit).map(x => line(x, true)), ...c.offers.filter(x => x.limit).map(x => line(x, false))];
    const wait = c.stats.contracts < RUSH.after ? `Rush orders start once you have delivered ${RUSH.after} contracts.`
      : `No rush order right now. One is offered about every ${Math.round(RUSH.every / 60)} minutes of play, when the yards can make it in time.`;
    return section('Rush orders', ...lines, lines.length ? null : note(wait),
      note(`A rush order pays more than any other order. If its time runs out it is gone, with ${RUSH.repLoss} reputation.`));
  }
  /** The market at a glance: every good with its price against normal, the alert mark, and the Sales Manager's switch. */
  marketWatch() {
    const c = this.company, pct = f => `${f >= 1 ? '+' : '−'}${(Math.abs(f - 1) * 100).toFixed(1)}%`;
    const at = Math.round((MARKET.alertAt - 1) * 100), sellAt = Math.round((MARKET.autoSellAt - 1) * 100);
    const rows = c.marketReport().filter(r => r.made).map(r => h('div', { class: 'hq-todo' },
      h('div', { class: 'hq-goal-body' },
        h('div', { class: 'hq-goal-text', text: `${cap(label(r.item))} · ${pct(r.factor)} now` }),
        r.next == null ? null : h('div', { class: 'hq-sub', text: `Next price: ${pct(r.next)}` })),
      this.button_(`Alert: ${r.alert ? 'On' : 'Off'}`, 'alert-' + r.item, () => this.act('toggle', () => c.setAlert(r.item, !r.alert)), { cls: r.alert ? 'small' : 'small quiet' })));
    const auto = c.canAutoSell()
      ? this.button_(`Sales Manager sells kept goods at +${sellAt}%: ${c.settings.autoSell ? 'On' : 'Off'}`, 'toggle-autosell',
        () => this.act('toggle', () => { c.settings.autoSell = !c.settings.autoSell; return true; }), { cls: c.settings.autoSell ? '' : 'quiet' })
      : note(`A Sales Manager trained to level ${MARKET.autoSellLevel} can sell the goods you keep in the warehouse by himself, when their price is ${sellAt}% above normal or more.`);
    return section('Market watch',
      ...(rows.length ? rows : [note('You do not make a market good yet.')]),
      note(`A good with its alert on is announced when its price rises to ${at}% above normal.${c.mods.forecast ? '' : ' Research the Market forecast to see the next price here.'}`),
      auto,
      c.canAutoSell() ? note('He sells only goods set to "Keep in the warehouse" on the Market tab, and never what a contract needs.') : null);
  }
}
