// The Contracts tab: the orders in force and on offer, and delivering them.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, empty, amount, bar, label, needText, cap, section, rewardChips, note, row } from './kit.js';
import { CONTRACTS } from '../data/company.js';
import { kindOf } from '../sim/company.js';
import { ITEMS } from '../data/areas.js';
import { icon } from '../icons.js';
import { fillTime, fillText, orderOffers } from '../sim/hqview.js';
import { storyFor } from '../sim/stories.js';
import { kindWhat } from '../data/help.js';

export class HqContracts {
  // --- Contracts -------------------------------------------------------------------
  /**
   * How long an order still needs at the pace its goods reach the shops now (the company's shopRate).
   * A running order counts what the orders accepted before it leave in the warehouse; an offer counts what no running order needs.
   */
  fill(x, running) {
    const c = this.company;
    let have = item => c.freeStock(item);
    if (running) {
      const left = { ...c.stock };
      for (const o of c.active) { if (o === x) break; for (const [item, qty] of o.needs) left[item] = Math.max(0, (left[item] || 0) - qty); }
      have = item => left[item] || 0;
    }
    return fillTime(x.needs, have, item => c.shopRate(item));
  }
  /** That time as a row of the card. Nothing arriving is said as it is, with the good named when the order has more than one. */
  fillRow(x, running) {
    const f = this.fill(x, running);
    const text = !f.stuck ? fillText(f) + (f.seconds >= 60 ? ' at the current pace' : '')
      : x.needs.length > 1 ? `no ${label(f.stuck)} are reaching the shop` : fillText(f);
    return h('div', { class: 'hq-row hq-fill' }, h('span', { text: 'Time to fill' }), h('b', { text }));
  }
  contractCard(x, running) {
    const c = this.company, kind = kindOf(x), reward = c.reward(x), ready = running && c.ready(x);
    const full = !running && c.active.length >= c.slots;
    // Who is asking and why: words only (js/sim/stories.js). An offer introduces the person; a running order keeps the story short.
    const story = storyFor(x, ITEMS);
    return h('article', { class: 'hq-card contract' + (ready ? ' ready' : '') },
      h('header', {}, h('h4', { text: x.client }), h('span', { class: 'hq-chip', text: kind.name })),
      h('div', { class: 'hq-sub hq-kind', text: cap(kindWhat(kind)) }),   // what the kind means, said every time: "One good, small"
      story ? h('div', { class: 'hq-story' },
        h('div', { class: 'hq-story-who' }, h('b', { text: story.who }), h('span', { text: ', ' + story.role + (running ? '' : ' · ' + story.about) })),
        h('p', { class: 'hq-story-text', text: `“${story.text}”` })) : null,
      ...x.needs.map(n => {
        const have = Math.min(c.stock[n[0]] || 0, n[1]);
        return h('div', { class: 'hq-need' }, h('span', { text: needText(n) }),
          running ? bar(have / n[1]) : null, running ? h('b', { text: `${have} / ${n[1]}` }) : null);
      }),
      ready ? null : this.fillRow(x, running),
      h('div', { class: 'hq-reward' }, amount(reward.cash, 'cash'),
        rewardChips({ over: Math.round((reward.cash / reward.value - 1) * 100), xp: reward.xp, rep: reward.rep })),
      running
        ? h('div', { class: 'hq-actions' },
          this.button_(ready ? 'Deliver' : 'Filling…', 'deliver-' + x.id, () => this.deliver(x), { cls: 'primary', disabled: !ready }),
          this.button_(this.confirm === 'drop-' + x.id ? 'Tap again to give up' : 'Give up', 'drop-' + x.id, () => {
            if (this.confirm !== 'drop-' + x.id) { this.confirm = 'drop-' + x.id; this.render(); return; }
            this.act('abandon', () => c.abandon(x.id));
          }, { cls: 'quiet' }))
        : h('div', { class: 'hq-actions' }, this.button_(full ? 'Finish the running one first' : 'Accept', 'accept-' + x.id, () => this.act('accept', () => c.accept(x.id)), { cls: 'primary', disabled: full })));
  }
  deliver(x) { this.act('deliver', () => this.company.deliver(x.id)); }
  contracts() {
    const c = this.company, bonus = Math.min(c.rep, CONTRACTS.repCap) * CONTRACTS.repBonus * 100;
    const wait = Math.ceil(c.refreshIn);
    // The offers in the order the player chose: by what they pay, by what they pay for each minute of waiting, or by how soon they are full.
    // Times are compared in whole minutes, as they are shown, so two offers do not swap places with every small change of pace.
    const offers = orderOffers(c.offers.map(x => ({ x, cash: c.reward(x).cash, seconds: Math.ceil(this.fill(x, false).seconds / 60) * 60 })), this.prefs.offers);
    // The rule of a contract as a picture: the goods go from the yards to the warehouse instead of the shops, then to the client.
    const step = (name, text, tone) => h('div', { class: 'hq-flow-step ' + tone }, h('span', { class: 'hq-flow-icon' }, icon(name)), h('span', { text }));
    // Shown until the first delivery; after that the "?" still has it.
    const picture = c.stats.contracts > 0 ? null : h('section', { class: 'hq-flow', 'aria-label': 'How a contract works' },
      h('div', { class: 'hq-flow-row' }, step('businesses', 'Your yards', 'up'), h('span', { class: 'hq-flow-arrow', 'aria-hidden': 'true', text: '→' }),
        step('warehouse', 'Warehouse', 'blue'), h('span', { class: 'hq-flow-arrow', 'aria-hidden': 'true', text: '→' }), step('contracts', 'Client', 'gold')),
      note('While an order runs, the goods it needs go to the warehouse instead of the shops. Delivered, they pay more than the shops would.'));
    // What runs comes first; with nothing running the offers move up, within reach, and the empty place is not drawn.
    return [
      c.active.length ? section('Running', ...c.active.map(x => this.contractCard(x, true))) : null,
      picture,
      section('Offers',
        offers.length > 1 ? this.choice('offers-by', 'Order the offers by', [['reward', 'Reward'], ['rate', 'Reward per minute'], ['time', 'Time to fill']], this.prefs.offers, v => this.setPref('offers', v)) : null,
        ...(offers.length ? offers.map(o => this.contractCard(o.x, false))
          : [empty('No client is asking yet. Offers appear here once your yards bring goods to the shops.', this.button_('See your yards', 'go-businesses', () => this.go('businesses')))]),
        this.button_(wait > 0 ? `New offers in ${wait} s` : 'Show me new offers', 'new-offers', () => this.act('offers', () => c.newOffers()), { disabled: wait > 0 })),
      section('Your standing', h('div', { class: 'hq-rows' }, row('Reputation', `${c.rep} · contracts pay +${bonus.toFixed(1)}%`), row('Contracts at once', String(c.slots)))),
    ];
  }
}
