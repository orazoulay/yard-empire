// The Team tab (workers, managers and staff) and the Ranking tab (the leaderboard).
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { RANKING, h, empty, money, amount, rate, chip, section, note, row } from './kit.js';
import { STAFF, STAFF_RULES } from '../data/company.js';
import { AREAS } from '../data/areas.js';
import { icon } from '../icons.js';
import { sinceText } from '../sim/hqview.js';

export class HqPeople {
  // --- Team ---------------------------------------------------------------------------
  team() {
    const c = this.company, s = c.summary(), staff = c.staff(), econ = this.game.econ;
    const hired = Object.keys(c.team).length;
    // Every manager is paid the same: the salaries the company pays, split by head. Before the first one
    // is hired there is nothing to split, so the figure comes from the rule itself (refreshCosts in js/sim/company.js).
    const salary = hired ? s.salaries / hired : STAFF_RULES.salaryShare * c.companyRef() * c.mods.wage;
    const share = s.costs > 0 ? Math.round(salary / s.costs * 100) : null;
    const cards = STAFF.map(def => {
      const st = c.staffState(def);
      const action = st.done ? chip('Fully trained', 'good', 'check')
        : st.lock ? chip(st.lock, '', 'lock')
          : this.button_(`${st.level ? 'Train' : 'Hire'} ${money(st.cost)}`, 'hire-' + def.id, () => this.act('hire', () => c.hire(def.id) && def), { cls: 'primary', disabled: !st.affordable, exact: st.cost });
      const toggle = def.id === 'factory' && st.level
        ? this.button_(`Buying upgrades: ${c.settings.autoBuy ? 'On' : 'Off'}`, 'toggle-autobuy', () => this.act('toggle', () => { c.settings.autoBuy = !c.settings.autoBuy; return true; }), { cls: c.settings.autoBuy ? '' : 'quiet' })
        : null;
      const pay = st.level
        ? h('div', { class: 'hq-sub hq-pay' }, 'Salary ', rate(salary), share == null ? null : ` · ${share < 1 ? 'under 1' : share}% of all costs`)
        : h('div', { class: 'hq-sub hq-pay' }, 'Salary once hired ', rate(salary), share == null ? null : ` · ${share < 1 ? 'under 1' : share}% on top of your costs`);
      return h('article', { class: 'hq-card staff' + (st.level ? ' hired' : '') + (st.lock ? ' locked' : '') },
        h('header', {}, h('h4', { text: def.name }), h('span', { class: 'hq-chip ' + (st.level ? 'good' : 'dim'), text: st.level ? `Level ${st.level}` : 'Not hired' })),
        h('ul', { class: 'hq-levels' }, ...def.levels.map((text, i) => h('li', { class: i < st.level ? 'on' : '' }, icon(i < st.level ? 'check' : 'dot'), h('span', { text: `Level ${i + 1}: ${text}` })))),
        pay,
        h('div', { class: 'hq-actions' }, action, toggle));
    });
    const yards = AREAS.filter(a => econ.areaOpen(a.id)).map(a => {
      const y = staff.yards[a.id];
      return row(a.name, [`${y.workers} worker${y.workers === 1 ? '' : 's'} · `, rate(c.yardCost(a.id).wages)]);
    });
    return [
      note('Managers work for the whole company. Each one is paid 1% of what your yards are expected to bring in, and can be trained twice.'),
      h('div', { class: 'hq-rows' }, row('Managers', `${hired} of ${STAFF.length}`), row('Salaries', rate(s.salaries)), row('Workers', String(staff.workers)), row('Wages', rate(s.wages))),
      section('Managers', ...cards),
      section('Workers by yard', h('div', { class: 'hq-rows' }, ...yards), note('Workers are hired on the plots in each yard.')),
    ];
  }

  // --- Ranking ------------------------------------------------------------------------
  async loadBoard(request = () => this.game.account.leaderboard(this.boardPeriod === 'week' ? 'week' : undefined)) {
    if (!this.game.account.supported) return;
    if (!this.board?.data) this.board = { loading: true };
    const call = ++this.boardCall;   // joining or leaving may overtake a refresh: only the newest answer counts
    this.boardBusy = true;
    const data = await request();
    if (call !== this.boardCall) return;
    this.boardBusy = false;
    this.board = data ? { data, at: Date.now() } : { error: true, data: this.board?.data, at: Date.now() };
    if (this.isOpen && this.tab === 'ranking' && !this.holding && !this.typing()) this.render();
  }
  /** The refresh button: it does nothing while a load is under way or just after one, so it cannot be hammered. */
  refreshBoard() {
    if (this.boardBusy || (this.board?.at && Date.now() - this.board.at < RANKING.wait)) return;
    this.loadBoard();
    this.render();
  }
  ranking() {
    const account = this.game.account, b = this.board;
    const week = this.boardPeriod === 'week';
    const intro = note('For fun: players who chose to join, ranked by company value. The server works the value out from your saved game and checks only that it is plausible, so do not read more into it than that.');
    // all time, or who gained the most since Monday (00:00 UTC); the other list is fetched when it is chosen
    const period = this.choice('rank-period', 'Which list', [['all', 'All time'], ['week', 'This week']], week ? 'week' : 'all',
      id => { if ((id === 'week') === week) return; this.boardPeriod = id; this.board = null; this.loadBoard(); this.render(); });
    if (!account.supported) return [intro, note('The ranking needs the game\'s account server, which this copy of the game does not have.')];
    const mine = [];
    if (!account.user) {
      mine.push(h('div', { class: 'hq-todo' }, h('span', { text: 'Create an account to join the ranking' }),
        this.button_('Account', 'rank-account', () => { this.close(); document.getElementById('btn-account').click(); })));
    } else if (b?.data?.me) {
      const me = b.data.me;
      mine.push(h('div', { class: 'hq-rows' },
        row(week ? 'Gained this week' : 'Your company', amount(week ? me.gain || 0 : me.value)),
        row('Your place', me.held ? 'Held back' : me.place ? '#' + me.place : 'Not on the list')));
      if (me.held) mine.push(note('Your company is kept off the list because its value grew faster than the game allows. Your progress is safe. An admin can clear this.'));
      mine.push(this.button_(me.listed ? 'Leave the ranking' : 'Join the ranking', 'rank-join',
        () => this.loadBoard(() => account.setListed(!me.listed)), { cls: me.listed ? 'quiet' : 'primary' }));
      if (!me.listed) mine.push(note('Joining shows your username and company value to other players. You can leave at any time.'));
    }
    // How old the list is, and a button to fetch it again. The button rests while a load is under way and for a few seconds after one.
    const age = b?.at ? (Date.now() - b.at) / 1000 : null, resting = this.boardBusy || (age != null && age * 1000 < RANKING.wait);
    const refresh = this.button_(this.boardBusy ? 'Refreshing…' : 'Refresh', 'rank-refresh', () => this.refreshBoard(), { cls: 'small', disabled: resting });
    const status = b?.data ? h('div', { class: 'hq-row hq-rank-status' }, h('span', { class: 'hq-sub', text: `Updated ${sinceText(age)}` }), refresh) : null;
    const line = (r, cls = '') => h('div', { class: 'hq-rank ' + cls },
      h('span', { class: 'hq-rank-place' + (r.place <= 3 ? ' top' : ''), text: String(r.place) }),
      h('div', { class: 'hq-goal-body' }, h('div', { class: 'hq-goal-text', text: r.username }), r.sub && h('div', { class: 'hq-sub', text: r.sub })),
      h('b', {}, amount(week ? r.gain || 0 : r.value)));
    let list;
    if (!b || b.loading) list = [empty('Loading the ranking. The top companies are listed here.')];
    else if (!b.data) list = [empty('The ranking could not be loaded. Check your connection, then try again.', refresh)];
    else if (!b.data.top.length) list = [empty('Nobody has joined yet. The first company to join is listed here.')];
    else {
      const name = account.user?.username;
      list = b.data.top.map(r => line({ ...r, sub: `${r.yards} yard${r.yards === 1 ? '' : 's'}${r.stars ? ` · ${r.stars} star${r.stars === 1 ? '' : 's'}` : ''}` }, r.username === name ? 'me' : ''));
      // Your own row stays in sight: marked inside the list, or pinned under it when your place is further down than the list goes.
      const me = b.data.me;
      if (me && me.listed && me.place && !me.held && !b.data.top.some(r => r.username === me.username)) {
        list.push(h('div', { class: 'hq-rank-gap', 'aria-hidden': 'true' }, icon('more')), line({ place: me.place, username: me.username, value: me.value, gain: me.gain, sub: 'Your company' }, 'me pinned'));
      }
      if (b.error) list.push(note('Could not refresh just now. Showing the last list.'));
    }
    return [intro, period, ...mine, section(week ? 'Gained the most since Monday' : 'Top companies', status, ...list)];
  }
}
