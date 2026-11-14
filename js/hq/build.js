// The Construction tab (the building site) and the Expansion tab (new yards and selling the company).
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, amount, bar, label, needText, cap, chip, section, note, row } from './kit.js';
import { fmt } from '../format.js';
import { RANKS, MILESTONES, MEASURES, LOCATIONS, PRESTIGE } from '../data/company.js';
import { AREAS } from '../data/areas.js';
import { BUILDS } from '../data/builds.js';
import { icon } from '../icons.js';

export class HqBuild {
  // --- Construction: the building site (js/data/builds.js, and "the building site" in js/sim/company.js) --------
  construction() {
    const c = this.company, list = c.buildList(), running = c.build();
    // What a build pays is said as money, not as "minutes of income": it is priced like the goals, by what the yards are
    // built to earn, and a company with research and managers earns several times that. The figure shown is the least it pays.
    const pays = b => [`${b.stages.length} stages · pays `, amount(b.minutes * 60 * c.goalRef()), ` or more, and ${fmt(b.xp)} experience`];
    const cards = list.map(({ build: b, state }, i) => h('article', { class: 'hq-card research ' + (state === 'done' ? 'done' : state === 'later' ? 'locked' : 'ready') },
      h('div', { class: 'hq-research-text' }, h('h4', { text: b.name }), h('div', { class: 'hq-sub', text: b.pitch }), h('div', { class: 'hq-sub' }, ...pays(b))),
      state === 'done' ? chip('Built', 'good', 'check')
        : state === 'running' ? chip('Being built', 'good')
          : state === 'ready' ? this.button_('Start building', 'build-' + b.id, () => this.act('build', () => c.startBuild(b.id) && b), { cls: 'primary' })
            : chip(i > 0 ? `After the ${BUILDS[i - 1].name}` : 'Not yet', '', 'lock')));
    const show = this.button_('Show me the site', 'site-show', () => this.game.showSite());
    const go = this.button_('Go to the site', 'site-go', () => this.game.goToSite());   // the player stands at the plot's entrance, and can walk into what is being built
    if (!running) {
      const all = list.every(x => x.state === 'done');
      return [
        section('Building site', note(all ? 'Everything here is built. The new quarter stands, and it stays when you sell the company.'
          : 'Build something bigger than a yard. A build goes up in stages, from goods your yards make: while it runs, the goods a stage needs go to the site instead of being sold. You can walk onto the site through the opening in the east fence of the Department Store.'),
          h('div', { class: 'hq-actions wrap' }, go, show)),
        section('What to build', ...cards),
      ];
    }
    // The stage in hand: a bar for each good, how many reach the shops a minute, and how long the stage needs at that pace.
    const pace = c.sitePace(), at = c.site.stage;
    const goods = pace.goods.map(g => h('div', { class: 'hq-site-good' },
      h('div', { class: 'hq-need' }, h('span', { text: cap(label(g.item)) }), bar(g.have / g.need, g.have >= g.need ? 'good' : ''), h('b', { text: `${fmt(g.have)} / ${fmt(g.need)}` })),
      // "No bricks reach", "No glass reaches": a name that ends in one s names many
      h('div', { class: 'hq-sub', text: g.have >= g.need ? 'All here' : g.none ? `No ${label(g.item)} ${/[^s]s$/.test(label(g.item)) ? 'reach' : 'reaches'} the shops now`
        : `${Math.round(g.perMinute)} a minute reach the shops` + (g.share === 'rush' ? ` · a rush order takes the next ${fmt(g.first)} first`
          : g.share === 'contract' ? ` · shared with a contract, one each, for the next ${fmt(2 * Math.min(g.first, g.need - g.have))}` : '') })));
    const time = pace.seconds != null ? `About ${Math.max(1, Math.ceil(pace.seconds / 60))} min at this pace`
      : pace.goods.some(g => g.none) ? 'No time can be given: a good this stage needs does not reach a shop. Carry it to the shop yourself, or see the Advisor for where it goes.' : '';
    const stages = running.stages.map((st, i) => h('div', { class: 'hq-stage ' + (i < at ? 'done' : i === at ? 'now' : 'later') },
      h('h4', {}, i < at ? icon('check') : null, h('span', { text: st.name })),
      i === at ? null : h('div', { class: 'hq-sub', text: i < at ? 'Finished' : st.needs.map(needText).join(' and ') })));
    const sendable = c.siteSendable();
    return [
      section(running.name, note(`Stage ${at + 1} of ${running.stages.length}: ${running.stages[at].name}`),
        ...goods, time ? row('This stage', time) : null,
        h('div', { class: 'hq-actions wrap' },
          this.switch_('Deliveries to the site', 'site-on', c.site.on, () => { c.setSiteOn(!c.site.on); this.game.save(); this.render(); }),
          this.button_(sendable ? `Send ${fmt(sendable)} from the warehouse` : 'Send from the warehouse', 'site-send', () => this.act('send', () => c.sendToSite()), { disabled: !sendable }),
          go, show),
        note('The building rises as the goods arrive. Go to the site to watch, and to walk into it while it has no roof.'),
        note(c.site.on ? 'Goods arrive while you play. A rush order is served first, and a contract that needs the same good shares it with the site; time away pays cash as before.'
          : 'Deliveries are stopped: every good is sold as usual, and the site keeps what it has. Goods arrive while you play.')),
      section('Stages', ...stages),
      section('What to build', ...cards),
    ];
  }

  // --- Expansion ----------------------------------------------------------------------------
  expansion() {
    const c = this.company, econ = this.game.econ;
    const places = LOCATIONS.map(l => {
      if (l.playable) {
        const yards = AREAS.filter(a => a.location === l.id), open = yards.filter(a => econ.areaOpen(a.id)).length;
        const here = this.game.playerArea.cfg.location === l.id;
        return h('article', { class: 'hq-card place' + (here ? ' here' : '') },
          h('header', {}, h('h4', { text: l.name }),
            h('span', { class: 'hq-chip ' + (here ? 'good' : open ? '' : 'dim'), text: here ? 'You are here' : open ? `${open} of ${yards.length} yards open` : 'Not open yet' })),
          h('div', { class: 'hq-sub', text: l.pitch }),
          bar(open / yards.length),
          h('div', { class: 'hq-yards' }, ...yards.map(a => (econ.areaOpen(a.id)
            ? h('button', { class: 'hq-chip travel', 'data-key': 'go-' + a.id, 'aria-label': 'Travel to ' + a.name, onclick: () => { if (this.game.travel(a.id)) this.close(); }, text: a.name + ' ›' })
            : h('span', { class: 'hq-chip dim', text: a.name })))),
          note(open ? 'Tap an open yard to travel there.' : l.opens),
          l.market && open ? h('div', { class: 'hq-actions' }, this.button_('See the market', 'go-market-' + l.id, () => this.go('market'))) : null);
      }
      return h('article', { class: 'hq-card place' },
        h('header', {}, h('h4', { text: l.name }), h('span', { class: 'hq-chip', text: 'Coming in a later update' })),
        h('div', { class: 'hq-sub', text: `Stage ${l.stage}. ${l.pitch}` }),
        h('div', { class: 'hq-yards' }, ...l.industries.map(i => h('span', { class: 'hq-chip dim', text: i }))),
        h('ul', { class: 'hq-needs' }, ...l.needs.map(n => h('li', { text: n })), h('li', { text: `Your rank: ${RANKS[c.rank].name}. Needed: ${RANKS[l.rank].name}.` })));
    });
    const groups = Object.keys(MEASURES).map(k => {
      const list = MILESTONES.filter(m => m.measure === k), value = c.measure(k);
      return h('div', { class: 'hq-goal-group' }, ...list.map(m => this.milestone(m, value)));
    });
    return [section('The road ahead', ...places), section('Selling the company', this.legacyCard()), section('Milestones', ...groups)];
  }
  /** Legacy stars, and the sale of the company: explained first, two presses to do it. */
  legacyCard() {
    const c = this.company, o = c.sellOffer(), stars = c.legacy.stars, pct = n => Math.round(n * PRESTIGE.starBonus * 100);
    const arm = this.confirm === 'sell';
    return h('article', { class: 'hq-card legacy' },
      h('header', {}, h('h4', {}, icon('star'), h('span', { text: `${stars} legacy star${stars === 1 ? '' : 's'}` })),
        h('span', { class: 'hq-chip ' + (stars ? 'good' : 'dim'), text: stars ? `+${pct(stars)}% on every sale` : 'None yet' })),
      h('div', { class: 'hq-sub', text: 'Once you have built far, you may sell the company and found a new one. The sale pays legacy stars, and every star raises all your prices by ' + Math.round(PRESTIGE.starBonus * 100) + '% for good. You never have to.' }),
      h('ul', { class: 'hq-needs' },
        h('li', { text: 'Stays: stars, rank, milestones, achievements, research, managers, reputation.' }),
        h('li', { text: 'Starts over: cash, yards and upgrades, truck routes, warehouse, contracts.' }),
        h('li', { text: `Each new company is a bigger build: every star also adds ${Math.round(PRESTIGE.costPerStar * 1000) / 10}% to the cost of its upgrades`
          + (PRESTIGE.minYardsPerSale ? `, and each sale needs ${PRESTIGE.minYardsPerSale} more yards built than the one before.` : '.') })),
      o.allowed
        ? row(`A sale now, with ${o.yards} yards fully built, pays`, `${o.stars} stars (+${pct(o.stars)}% prices, +${Math.round(o.stars * PRESTIGE.costPerStar * 100)}% costs)`)
        : note(`A sale needs ${o.min} fully built yards. You have ${o.yards}.`),
      o.allowed ? h('div', { class: 'hq-actions' }, this.button_(arm ? 'Tap again to sell everything' : 'Sell the company', 'sell',
        () => { if (!arm) { this.confirm = 'sell'; this.render(); return; } this.game.sellCompany(); }, { cls: arm ? 'danger' : '' })) : null);
  }
}
