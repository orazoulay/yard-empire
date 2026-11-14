// The "?" of each tab (How it works) and the tour a new company gets the first time it opens the Headquarters.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h } from './kit.js';
import { icon } from '../icons.js';
import { HELP, TERMS, TOUR } from '../data/help.js';

export class HqHelp {
  // --- How it works, and the tour ---------------------------------------------------
  /** The "?" of a tab: a line that opens a short card on how the tab works, with the words it uses. Null for a tab without one. */
  helpBlock(tab) {
    const help = HELP[tab];
    if (!help) return null;
    const open = this.helpOpen === tab, toggle = () => { this.helpOpen = open ? null : tab; this.render(); };
    if (!open) {
      return h('button', { class: 'hq-help-btn', 'data-key': 'help-' + tab, 'aria-expanded': 'false', onclick: toggle },
        h('span', { class: 'hq-help-q', 'aria-hidden': 'true', text: '?' }), h('span', { text: help.title }));
    }
    const [head, ...rows] = help.table || [];
    return h('section', { class: 'hq-card hq-help', 'aria-label': help.title },
      h('header', {}, h('h4', { text: help.title }),
        h('button', { class: 'hq-help-close', 'data-key': 'help-' + tab, 'aria-expanded': 'true', 'aria-label': 'Close ' + help.title, onclick: toggle }, icon('close'))),
      h('ol', { class: 'hq-help-steps' }, ...help.steps.map(([lead, rest]) => h('li', {}, h('b', { text: lead }), h('span', { text: ' ' + rest })))),
      head ? h('table', { class: 'hq-help-table' },
        h('thead', {}, h('tr', {}, ...head.map(t => h('th', { text: t })))),
        h('tbody', {}, ...rows.map(r => h('tr', {}, ...r.map(t => h('td', { text: t })))))) : null,
      help.terms.length ? h('dl', { class: 'hq-help-terms' }, ...help.terms.map(id => h('div', {}, h('dt', { text: TERMS[id][0] }), h('dd', { text: TERMS[id][1] })))) : null,
      h('div', { class: 'hq-actions' },
        this.button_('Got it', 'help-done', toggle, { cls: 'primary' }),
        help.tour ? this.button_('Show the tour again', 'tour-again', () => { this.helpOpen = null; this.tourAt = 0; this.render(); }, { cls: 'quiet' }) : null));
  }
  /**
   * A company that is new to the Headquarters gets three cards on what it is for, the first time it opens.
   * A company that has already delivered a contract or researched something knows its way: it is not shown.
   */
  startTour() {
    if (this.prefs.toured || this.tourAt != null) return;
    const c = this.company;
    if (c.stats.contracts > 0 || Object.values(c.research).some(v => v > 0)) { this.setPref('toured', true, false); return; }
    this.tourAt = 0; this.tab = 'overview';
  }
  endTour(go) {
    this.tourAt = null; this.setPref('toured', true, false);
    if (go) this.go(go); else this.render();
  }
  tourCard() {
    if (this.tourAt == null) return null;
    const i = this.tourAt, card = TOUR[i], last = i === TOUR.length - 1;
    return h('section', { class: 'hq-card hq-tour', 'aria-label': `Tour, card ${i + 1} of ${TOUR.length}` },
      h('div', { class: 'hq-tour-kicker', text: `Your company · ${i + 1} of ${TOUR.length}` }),
      h('h4', { text: card.title }),
      h('p', { class: 'hq-note', text: card.text }),
      h('div', { class: 'hq-tour-foot' },
        h('div', { class: 'hq-tour-dots', 'aria-hidden': 'true' }, ...TOUR.map((_, j) => h('span', { class: j === i ? 'on' : '' }))),
        last ? null : this.button_('Skip', 'tour-skip', () => this.endTour(), { cls: 'quiet' }),
        last && card.go ? this.button_(card.button, 'tour-go', () => this.endTour(card.go), { cls: 'quiet' }) : null,
        this.button_(last ? 'Done' : 'Next', 'tour-next', () => { if (last) this.endTour(); else { this.tourAt = i + 1; this.render(); } }, { cls: 'primary' })));
  }
}
