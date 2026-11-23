// The Records tab, the company's name, and the account a guest is offered to keep their game.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, figure, label, cap, kpi, section, note, row } from './kit.js';
import { fmt } from '../format.js';
import { icon, emblemIcon } from '../icons.js';
import { CLIENTS } from '../data/company.js';
import { cleanName, NAME_MAX } from '../sim/company.js';
import { personOf } from '../sim/stories.js';

export class HqRecords {
  // --- Records ------------------------------------------------------------------------------------------
  records() {
    const c = this.company, b = c.recordBook();
    const hours = sec => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.floor(sec % 3600 / 60)} min` : `${Math.floor(sec / 60)} min`);
    const goods = b.goods.slice(0, 8).map(g => h('div', { class: 'fin-row share' },
      h('span', { class: 'fin-name', text: cap(label(g.item)) }), h('span', { class: 'fin-share' }, h('i', { width: g.share })),
      h('span', { class: 'fin-pct', text: Math.round(g.share * 100) + '%' }), figure(fmt(g.count))));
    const person = name => { const p = personOf(name); return p ? `${name} (${p.who})` : name; };   // the regular by name, with who runs it
    const clients = c.clientList().slice(0, 10).map(x => row(person(x.name),
      `${x.level ? `Level ${x.level} · +${Math.round(c.clientBonus(x.name) * 100)}%` : 'New'} · ${x.orders} order${x.orders === 1 ? '' : 's'}${x.next ? ` · next level at ${x.next}` : ''}`));
    return [
      this.nameCard(),
      h('div', { class: 'fin-kpis' },
        kpi('Items to the shops', fmt(b.sold)),
        kpi('Best minute', b.peakMinute, '', null, 'gold'),
        kpi('Largest contract', b.bestContract),
        kpi('Time played', hours(b.played)),
        kpi('Companies sold', String(b.companiesSold)),
        kpi('Best streak', String(b.bestStreak), b.bestStreak === 1 ? 'day' : 'days')),
      b.partial ? note('This company is older than its records. The goods below and the time played are counted from the day the records began; the total of items goes back to the start.') : null,
      section(`Top goods · ${b.goods.length} sold so far`, goods.length ? h('div', { class: 'fin-panel cols' }, ...goods) : note('Nothing has reached a shop yet.'),
        b.goods.length > 8 ? note(`And ${b.goods.length - 8} more.`) : null),
      section('Contracts and market', h('div', { class: 'hq-rows' },
        row('Contracts delivered', fmt(b.contracts)),
        row('Rush orders delivered in time', fmt(b.rush)),
        row('Rush orders that ran out', fmt(b.rushLate)),
        row('Goods sold on the market', fmt(b.marketSold)),
        row('From the warehouse at 10% or more above normal', fmt(b.marketGood)))),
      section('Regular clients', ...(clients.length ? [h('div', { class: 'hq-rows' }, ...clients)] : []),
        note(`A client you deliver to again and again becomes a regular: at ${CLIENTS.levels.join(', ').replace(/, (\d+)$/, ' and $1')} orders it moves up a level, and each level adds ${Math.round(CLIENTS.bonus * c.mods.clientBonus * 100)}% to what its orders pay.`)),
      this.keepCard(),
    ];
  }

  // --- the company's name ---------------------------------------------------------------------------------
  /** Put the company's name where the screen says "Business Headquarters". Called when the game starts and after a rename. */
  showName() {
    const el = this.el.querySelector?.('.hq-kicker');
    if (el) el.textContent = this.company.name || 'Business Headquarters';
  }
  /**
   * The company's emblem (Company emblem of the credits store) at the head of the screen, before the rank: the emblem in
   * white on the company's colour. Called when the looks are put on (js/game/looks.js); null takes it away.
   * @param emblem  { id, colour } or null
   */
  showEmblem(emblem) {
    const el = this.el.querySelector?.('#hq-emblem'), key = emblem ? `${emblem.id}:${emblem.colour}` : '';
    if (!el || key === (this.emblemKey || '')) return;
    this.emblemKey = key;
    el.hidden = !emblem;
    if (!emblem) { el.replaceChildren(); return; }
    el.style.background = '#' + emblem.colour.toString(16).padStart(6, '0');
    el.replaceChildren(emblemIcon(emblem.id));
  }
  nameCard() {
    const name = this.company.name;
    return h('article', { class: 'hq-card name' },
      h('header', {}, h('h4', {}, icon('edit'), h('span', { text: name || 'Your company has no name yet' })), name ? null : h('span', { class: 'hq-chip dim', text: 'Unnamed' })),
      h('div', { class: 'hq-sub', text: `A name of up to ${NAME_MAX} characters, shown at the top of your Headquarters.` }),
      h('div', { class: 'hq-actions' }, this.button_(name ? 'Change the name' : 'Name the company', 'name-edit', () => this.editName())));
  }
  /**
   * The name is typed in a small box over the screen, not on the tab: the tab is drawn again twice a
   * second, which would take the field from under the fingers.
   */
  editName() {
    if (this.nameBox) return;
    const c = this.company;
    const input = h('input', { class: 'hq-input', type: 'text', maxlength: String(NAME_MAX), value: c.name, 'aria-label': 'Company name', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done' });
    const hint = h('div', { class: 'hq-sub' });
    const say = () => {
      const typed = input.value.trim(), clean = cleanName(input.value);
      hint.textContent = !typed ? 'Letters, digits, spaces and & \' . , - can be used. Leave it empty for no name.'
        : clean === typed ? `${clean.length} of ${NAME_MAX} characters` : clean ? `Will be kept as: ${clean}` : 'Nothing of this can be kept. Use letters and digits.';
    };
    const shut = () => { this.nameBox.remove(); this.nameBox = null; this.render(); this.el.querySelector('[data-key="name-edit"]')?.focus({ preventScroll: true }); };
    const keep = () => {
      const name = c.rename(input.value);
      this.game.afterCompanyAction('rename', true);
      this.showName(); shut();
      this.toast(name ? `Your company is now called ${name}` : 'Your company has no name now');
    };
    const stops = [input, this.button_('Save', 'name-save', keep, { cls: 'primary' }), this.button_('Cancel', 'name-cancel', shut, { cls: 'quiet' })];
    this.nameBox = h('div', { class: 'hq-edit', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Name your company',
      onclick: e => { if (e.target === this.nameBox) shut(); },
      onkeydown: e => {
        if (e.key === 'Escape') { e.stopPropagation(); shut(); }   // closes the box, not the Headquarters behind it
        else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); keep(); }
        else if (e.key === 'Tab') {   // the keyboard stays in the box while it is open
          e.preventDefault();
          stops[(stops.indexOf(e.target) + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
        }
      } },
      h('div', { class: 'hq-edit-box' }, h('h4', { text: 'Name your company' }), input, hint, h('div', { class: 'hq-actions' }, stops[1], stops[2])));
    input.addEventListener('input', say);
    (this.el.querySelector('.hq') || this.el).append(this.nameBox);
    input.value = c.name; say();
    input.focus(); input.select?.();
  }

  // --- keeping a guest's game ------------------------------------------------------------------------------
  /** For a guest: the game is tied to this device until there is an account. Nothing where accounts are not offered, and for a player who has one. */
  keepCard() {
    const account = this.game.account;
    if (!account?.supported || account.user) return null;
    return section('Keep your game', h('article', { class: 'hq-card keep' },
      h('div', { class: 'hq-sub', text: 'Your game is tied to this device. Create an account and it is yours on any device.' }),
      h('div', { class: 'hq-actions' }, this.button_('Create an account', 'keep-account', () => { this.close(); document.getElementById('btn-account').click(); }, { cls: 'primary' }))));
  }
}
