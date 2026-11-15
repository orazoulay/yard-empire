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
  async loadBoard(request = () => this.game.account.leaderboard(this.boardPeriod === 'week' ? 'week' : undefined, this.boardKind === 'boosted' ? 'boosted' : undefined)) {
    if (!this.game.account.supported) return;
    if (!this.board?.data) this.board = { loading: true };
    const call = ++this.boardCall;   // joining or leaving may overtake a refresh: only the newest answer counts
    this.boardBusy = true;
    const data = await request();
    if (call !== this.boardCall) return;
    this.boardBusy = false;
    // at: when the list was last asked for; dataAt: when the list shown was fetched (an error keeps the older list, and its time)
    this.board = data ? { data, at: Date.now(), dataAt: Date.now() } : { error: true, data: this.board?.data, at: Date.now(), dataAt: this.board?.dataAt ?? this.board?.at };
    if (this.isOpen && this.tab === 'ranking' && !this.holding && !this.typing()) this.render();
  }
  /** The refresh button: it does nothing while a load is under way or just after one, so it cannot be hammered. */
  refreshBoard() {
    if (this.boardBusy || (this.board?.at && Date.now() - this.board.at < RANKING.wait)) return;
    this.loadBoard();
    this.render();
  }
  /**
   * What the Ranking tab says to the owner of the Ranking frame (the credits store): the frame is drawn by the server's
   * word on each line of its list, so a company that is not on the list being looked at shows none, and the owner is told
   * why. The others are sent the top twenty only: a framed line further down is seen by its owner alone. A list fetched
   * before this visit saw the frame owned (frameSince) says nothing of frames: no line, until a fresh one is in (frameStale).
   * @param me     the player's own entry of the list (the server's `me`), or null
   * @param other  the ranking the company is on when the other one is looked at ('main' or 'boosted'), else ''
   * @returns the line, or '' for a player without the frame
   */
  frameLine(me = this.board?.data?.me, other = '') {
    const c = this.game.credits, item = c?.catalog?.items?.find(i => i.does === 'frame');   // the item that does "frame", as the server finds it
    if (!item || !c.owns?.(item.id)) { this.frameSince = null; return ''; }
    this.frameSince ??= Date.now();
    if (other) return me?.listed && !me.held ? `Your Ranking frame is drawn around your line on the ${other} ranking, where your company is ranked.` : '';
    if (!me?.listed || !me.place || me.held) return 'Your Ranking frame is drawn around your line once your company is on this list.';
    if (me.frame !== true) return this.frameStale() ? '' : 'The ranking does not draw frames yet. Your Ranking frame shows on your line once it does.';   // a server from before the looks
    return me.place <= 20 ? 'Your line has its gold frame, for every player to see.' : 'Your line has its gold frame. Other players see it once your company is in the top twenty.';
  }
  /** The list shown was fetched before this visit saw the Ranking frame owned: what it says of frames is from before. */
  frameStale() {
    const b = this.board;
    return this.frameSince != null && !!b?.data && !((b.dataAt ?? b.at ?? 0) >= this.frameSince);
  }
  ranking() {
    const account = this.game.account, b = this.board;
    const week = this.boardPeriod === 'week';
    // Two rankings where the server runs the credits store: the main one, and one for the companies that bought something
    // that changes what they earn. Which one a company is on is the server's word (js/credits.js, boosted).
    const store = !!this.game.credits?.engine, boosted = store && this.boardKind === 'boosted', bought = store && this.game.credits.boosted === true;
    const elsewhere = store && boosted !== bought;   // the list being looked at is not the one this company is on
    const intro = boosted
      ? note('Companies that bought cash, boosts or upgrades with credits are ranked here, apart from the main ranking. For fun, like the main one.')
      : note('For fun: players who chose to join, ranked by company value. The server works the value out from your saved game and checks only that it is plausible, so do not read more into it than that.');
    const kind = store ? [this.choice('rank-board', 'Which ranking', [['main', 'Main'], ['boosted', 'Boosted']], boosted ? 'boosted' : 'main',
      id => { if ((id === 'boosted') === boosted) return; this.boardKind = id; this.board = null; this.loadBoard(); this.render(); })] : [];
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
        row('Your place', me.held ? 'Held back' : elsewhere ? (boosted ? 'Not on this list' : 'On the boosted ranking') : me.place ? '#' + me.place : 'Not on the list')));
      if (elsewhere && !me.held) mine.push(note(boosted ? 'This list is for companies that bought something that changes what they earn. Yours has not.'
        : 'Your company bought something that changes what it earns, so it is ranked with the boosted companies, for good.'));
      if (me.held) mine.push(note('Your company is kept off the list because its value grew faster than the game allows. Your progress is safe. An admin can clear this.'));
      mine.push(this.button_(me.listed ? 'Leave the ranking' : 'Join the ranking', 'rank-join',
        // joining answers with the main all-time list: any other list is asked for again
        () => this.loadBoard(async () => { const r = await account.setListed(!me.listed); return r && (week || boosted) ? account.leaderboard(week ? 'week' : undefined, boosted ? 'boosted' : undefined) : r; }),
        { cls: me.listed ? 'quiet' : 'primary' }));
      if (!me.listed) mine.push(note('Joining shows your username and company value to other players. You can leave at any time.'));
      const framed = this.frameLine(me, elsewhere ? (boosted ? 'main' : 'boosted') : '');
      if (framed) mine.push(note(framed));
      // a list from before the frame was owned: a fresh one is asked for once (one that cannot be had waits for the next refresh)
      else if (this.frameStale() && !this.boardBusy && !((this.board.at ?? 0) >= this.frameSince)) this.loadBoard();
    }
    // How old the list is, and a button to fetch it again. The button rests while a load is under way and for a few seconds after one.
    const age = b?.at ? (Date.now() - b.at) / 1000 : null, resting = this.boardBusy || (age != null && age * 1000 < RANKING.wait);
    const refresh = this.button_(this.boardBusy ? 'Refreshing…' : 'Refresh', 'rank-refresh', () => this.refreshBoard(), { cls: 'small', disabled: resting });
    const status = b?.data ? h('div', { class: 'hq-row hq-rank-status' }, h('span', { class: 'hq-sub', text: `Updated ${sinceText(age)}` }), refresh) : null;
    // A line whose company owns the Ranking frame is framed in gold: the server says so on the line (`frame`), and nothing else about that account.
    const line = (r, cls = '') => h('div', { class: 'hq-rank ' + cls + (r.frame === true ? ' framed' : '') },
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
        list.push(h('div', { class: 'hq-rank-gap', 'aria-hidden': 'true' }, icon('more')), line({ place: me.place, username: me.username, value: me.value, gain: me.gain, frame: me.frame, sub: 'Your company' }, 'me pinned'));
      }
      if (b.error) list.push(note('Could not refresh just now. Showing the last list.'));
    }
    const title = boosted ? (week ? 'Boosted: gained the most since Monday' : 'Top boosted companies') : week ? 'Gained the most since Monday' : 'Top companies';
    return [intro, ...kind, period, ...mine, section(title, status, ...list)];
  }
}
