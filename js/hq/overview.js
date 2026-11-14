// The Overview tab: what needs doing now, the first steps and the next milestones.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, empty, aMinute, withAmount, ofLine, bar, kpi, marked, MEASURE_ICON, section, note } from './kit.js';
import { fmt } from '../format.js';
import { RESEARCH, MILESTONES, MEASURES, milestoneText } from '../data/company.js';
import { AREAS } from '../data/areas.js';
import { icon } from '../icons.js';

export class HqOverview {
  // --- Overview ---------------------------------------------------------------
  overview() {
    const c = this.company, s = c.summary(), staff = c.staff();
    const ready = c.active.filter(x => c.ready(x));
    const todo = [];
    for (const x of ready) todo.push(h('div', { class: 'hq-todo good' }, marked('contracts', `The order for ${x.client} is ready`), this.button_('Deliver', 'deliver-' + x.id, () => this.deliver(x), { cls: 'primary' })));
    const waiting = c.goalsWaiting();
    if (waiting) todo.push(h('div', { class: 'hq-todo good' }, marked('goals', `${waiting} goal reward${waiting === 1 ? '' : 's'} to collect`), this.button_('Open goals', 'go-goals', () => this.go('goals'), { cls: 'primary' })));
    // Routes into Industrial City that could be running: its factories have no materials of their own.
    const cityRoutes = c.routeDefs.filter(d => !c.routes[d.id] && this.game.econ.areaOpen(d.from) && this.game.econ.areaOpen(d.to) && AREAS.find(a => a.id === d.to).location !== 'town');
    if (cityRoutes.length) todo.push(h('div', { class: 'hq-todo' }, marked('logistics', `Your factories need trucks: ${cityRoutes.length} route${cityRoutes.length === 1 ? '' : 's'} to buy`), this.button_('Logistics', 'go-logistics', () => this.go('logistics'))));
    if (!c.active.length) todo.push(h('div', { class: 'hq-todo' }, marked('contracts', 'No contract is running'), this.button_('See offers', 'go-contracts', () => this.go('contracts'))));
    if (!c.tabLock('research') && RESEARCH.some(r => { const st = c.researchState(r); return !st.done && !st.lock && st.affordable; })) {
      todo.push(h('div', { class: 'hq-todo' }, marked('research', 'You can afford new research'), this.button_('Open lab', 'go-research', () => this.go('research'))));
    }
    // What to do comes first, then the next first step, then the company in four figures (the rest are on Finance and Records).
    return [
      section('Needs your attention', ...(todo.length ? todo : [empty('Nothing needs you right now. Orders to deliver, rewards to collect and routes to buy are listed here.')])),
      this.firstSteps(),
      section('Your company',
        h('div', { class: 'fin-kpis' },
          kpi('Company value', s.valuation, '', null, 'gold'),
          kpi('Profit', aMinute(s.profit), '/min', null, s.profit < 0 ? 'down' : 'up'),
          kpi('Yards', String(this.game.econ.areas.length), `of ${AREAS.length}`),
          kpi('Employees', String(staff.workers))),
        this.button_('Income and costs on Finance', 'go-finance', () => this.go('finance'), { cls: 'quiet small' })),
      section('Next milestones', ...this.milestones(3)),
    ];
  }
  /**
   * The first five things to do with a new company: how far along they are as five segments, and the next one
   * as a card with what it is for and a button that leads there. Gone once all are done.
   */
  firstSteps() {
    const c = this.company;
    const steps = [
      ['Accept a contract', 'A client pays more for your goods than the shops do.', c.active.length > 0 || c.stats.contracts > 0, 'contracts'],
      ['Deliver it', 'The goods for the order collect in your warehouse. Deliver when it is full.', c.stats.contracts > 0, 'contracts'],
      ['Research a technology', 'Research makes every yard better, for good.', Object.values(c.research).some(v => v > 0), 'research'],
      ['Hire a manager', 'Managers do part of your work for you.', Object.keys(c.team).length > 0, 'team'],
      ['Buy a truck route', 'Trucks carry goods from yard to yard, so nobody has to walk.', Object.values(c.routes).some(Boolean), 'logistics'],
    ];
    const done = steps.filter(s => s[2]).length, next = steps.findIndex(s => !s[2]);
    if (next < 0) return null;
    const [name, why, , tab] = steps[next], lock = c.tabLock(tab);
    return section(`First steps · ${done} of ${steps.length}`, h('article', { class: 'hq-card hq-step' },
      h('div', { class: 'hq-step-track', role: 'img', 'aria-label': `${done} of ${steps.length} steps done` },
        ...steps.map((st, i) => h('span', { class: st[2] ? 'done' : i === next ? 'next' : '' }))),
      h('h4', { text: name }),
      h('div', { class: 'hq-sub', text: lock || why }),
      lock ? null : this.button_('Show me', 'step-' + next, () => this.go(tab), { cls: 'primary' }),
      done ? h('div', { class: 'hq-sub hq-step-done', text: 'Done: ' + steps.filter(st => st[2]).map(st => st[0]).join(', ') }) : null));
  }
  /** The milestones closest to being reached. */
  milestones(count) {
    const c = this.company;
    const open = MILESTONES.filter(m => !c.done[m.id]).map(m => ({ m, value: c.measure(m.measure) }))
      .filter((x, i, all) => all.findIndex(y => y.m.measure === x.m.measure) === i)   // the next one of each kind
      .sort((a, b) => b.value / b.m.at - a.value / a.m.at).slice(0, count);
    if (!open.length) return [note('Every milestone is done. More goals arrive with the next location.')];
    return open.map(({ m, value }) => this.milestone(m, value));
  }
  milestone(m, value) {
    const meas = MEASURES[m.measure], text = milestoneText(m, fmt);
    const done = this.company.done[m.id];
    return h('div', { class: 'hq-goal' + (done ? ' done' : '') },
      h('span', { class: 'hq-goal-icon' }, icon(done ? 'check' : MEASURE_ICON[m.measure] || 'goals')),
      h('div', { class: 'hq-goal-body' },
        h('div', { class: 'hq-goal-text' }, ...(meas.money ? withAmount(text, m.at) : [text])),
        done ? null : bar(value / m.at),
        done ? null : ofLine(Math.min(value, m.at), m.at, meas.money)),
      h('span', { class: 'hq-xp-chip', text: `+${m.xp} XP` }));
  }
}
