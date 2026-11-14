// The Goals tab: goal cards, collecting rewards, and the daily streak with the day's swap.
// Added to the Headquarters class in js/hq.js (see mix() in js/hq/kit.js): `this` is the Headquarters.
import { h, empty, money, exact, amount, withAmount, ofLine, bar, chip, marked, KIND_ICON, section, rewardChips, note } from './kit.js';
import { fmt } from '../format.js';
import { GOALS, ACHIEVEMENTS, STREAK } from '../data/company.js';
import { icon } from '../icons.js';
import { countdown } from '../sim/hqview.js';

export class HqGoals {
  // --- Goals ------------------------------------------------------------------------
  goalCard(g) {
    const kind = GOALS.kinds.find(k => k.id === g.kind), show = v => (kind.money ? money(v) : fmt(v));
    const text = g.target === 1 && kind.one ? kind.one : kind.text.replace('{n}', show(g.target));
    // What it is, how far it is, what it pays (the same chips as a contract), and a button only once there is something to do.
    return h('article', { class: 'hq-card goal' + (g.claimed ? ' done' : g.done ? ' ready' : '') },
      h('header', {}, h('h4', {}, icon(KIND_ICON[g.kind] || 'goals'), h('span', {}, ...(kind.money ? withAmount(text, g.target) : [text])))),
      g.claimed ? null : h('div', { class: 'hq-need' }, bar(g.value / Math.max(g.target, 1)),
        h('b', {}, ...(kind.money ? [amount(g.value), ' / ', amount(g.target)] : [`${fmt(g.value)} / ${fmt(g.target)}`]), g.done ? '' : ' · in progress')),
      g.claimed ? chip('Collected', 'good', 'check')
        : g.done ? h('div', { class: 'hq-actions' }, this.button_(`Collect ${money(g.cash)}`, `goal-${g.period}-${g.index}`,
          () => this.act('goal', () => this.company.claimGoal(g.period, g.index)), { cls: 'primary', exact: g.cash }), rewardChips({ xp: g.xp }))
          : rewardChips({ cash: g.cash, xp: g.xp }));
  }
  /** Every finished goal whose reward has not been collected, and what collecting them all pays, the daily bonus included when it falls due. */
  goalsReady() {
    const c = this.company, daily = c.goalList('daily');
    const list = ['event', 'daily', 'weekly'].flatMap(p => c.goalList(p)).filter(g => g.done && !g.claimed);
    const bonus = !c.goals.bonus && daily.length > 0 && daily.every(g => g.claimed || g.done) && daily.some(g => !g.claimed);
    return { list, cash: list.reduce((sum, g) => sum + g.cash, 0) + (bonus ? c.goals.bonusCash : 0) };
  }
  /** Collect everything that is ready with one press: the same claim as each card's own button, and one line of feedback for the lot. */
  collectAll() {
    this.act('goal', () => {
      const c = this.company, out = { cash: 0, xp: 0, bonus: false };
      for (const g of this.goalsReady().list) {
        const got = c.claimGoal(g.period, g.index);
        if (got) { out.cash += got.cash; out.xp += got.xp; out.bonus = out.bonus || got.bonus; }
      }
      return out.cash || out.xp ? out : null;
    });
  }
  goals() {
    const c = this.company, now = new Date();
    // New goals come with the player's own calendar (main.js, today): at the next midnight, and on Monday.
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
    const days = ((8 - now.getDay()) % 7) || 7;   // until Monday
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days) - now;
    const done = ACHIEVEMENTS.filter(a => c.badges[a.id]).length;
    const bonusText = `Collect all three for a bonus of ${money(c.goals.bonusCash)} and ${GOALS.daily.bonusXp} experience.`;
    const bonus = c.goals.bonus ? note('Daily bonus collected. New goals arrive at midnight.') : note(...withAmount(bonusText, c.goals.bonusCash));
    const event = c.eventNow(), ready = this.goalsReady();
    // Within each list: a reward that waits first, then what is in progress, then what is collected.
    const rank = g => (g.claimed ? 2 : g.done ? 0 : 1);
    const sorted = period => [...c.goalList(period)].sort((a, b) => rank(a) - rank(b));
    const cards = (period, waiting) => { const list = sorted(period); return list.length ? list.map(g => this.goalCard(g)) : [empty(waiting)]; };
    // Achievements: the three nearest to being earned, and the whole list on request.
    const badge = a => {
      const got = !!c.badges[a.id], value = got ? a.at : Math.min(c.achieved(a.measure), a.at);
      return { a, got, value, near: got ? -1 : value / a.at };
    };
    const badges = ACHIEVEMENTS.map(badge), all = !!this.unfold?.badges;
    const shown = all ? badges : badges.filter(b => !b.got).sort((x, y) => y.near - x.near).slice(0, 3);
    return [
      ready.list.length > 1 ? h('div', { class: 'hq-todo good' }, marked('goals', `${ready.list.length} rewards are ready`),
        this.button_(`Collect all ${money(ready.cash)}`, 'goal-all', () => this.collectAll(), { cls: 'primary', exact: ready.cash })) : null,
      event ? section(`${event.name} · until ${event.until}`, note(event.desc + '.'), ...sorted('event').map(g => this.goalCard(g))) : null,
      section(`Today · new goals in ${countdown(midnight)}`, ...cards('daily', 'Three goals for the day appear here, with new ones every midnight.'), bonus),
      this.streakSection(),
      section(`This week · new goals in ${countdown(monday)}`, ...cards('weekly', 'Three goals for the week appear here, with new ones every Monday.'),
        note('Goals you do not finish are simply replaced. Nothing is lost.')),
      section(`Achievements · ${done} of ${ACHIEVEMENTS.length}`, ...shown.map(({ a, got, value }) => {
        return h('div', { class: 'hq-goal' + (got ? ' done' : '') },
          h('span', { class: 'hq-goal-icon' }, icon(got ? 'check' : 'award')),
          h('div', { class: 'hq-goal-body' }, h('div', { class: 'hq-goal-text', text: a.name }), h('div', { class: 'hq-sub' }, ...(a.money ? withAmount(a.desc, a.at) : [a.desc])),
            got || a.at <= 4 ? null : bar(value / a.at), got || a.at <= 4 ? null : ofLine(value, a.at, a.money)),
          h('span', { class: 'hq-xp-chip', text: `+${a.xp} XP` }));
      }),
      this.button_(all ? 'Show the nearest three' : `Show all ${ACHIEVEMENTS.length} achievements`, 'badges-all',
        () => { (this.unfold ||= {}).badges = !all; this.render(); }, { cls: 'quiet small' })),
    ];
  }

  // --- Goals: the daily streak and the day's swap -----------------------------------------------------
  /** One section for the Goals tab: how the streak stands, and the one goal that may be exchanged today. */
  streakSection() {
    const c = this.company, s = c.streakInfo(), pct = n => Math.round(n * 100), days = n => `${n} day${n === 1 ? '' : 's'}`;
    const top = pct(STREAK.step * (STREAK.cap - 1));
    let say;
    if (s.claimed) {
      const next = Math.min(STREAK.cap, s.count + 1);
      say = `Day ${s.count} is counted${s.paid > 0 ? `: today's first goal paid ${pct(s.paid)}% more` : ''}. Collect a daily goal tomorrow for ${pct(STREAK.step * (next - 1))}%.`;
    } else if (s.bonus > 0) {
      say = `${s.missed ? `You missed ${days(s.missed)}, so the streak went back to ${days(s.count)}. ` : ''}The first daily goal you collect today pays ${pct(s.bonus)}% more.`;
    } else say = 'Collect a daily goal today to start a streak. From the second day in a row, the first goal of the day pays more.';
    const streak = h('article', { class: 'hq-card streak' },
      h('header', {}, h('h4', {}, icon('streak'), h('span', { text: 'Day streak' })),
        h('span', { class: 'hq-chip ' + (s.claimed ? 'good' : ''), text: s.claimed ? `Day ${s.count} counted` : `Today is day ${s.count}` })),
      // the days counted so far are lit; today's, until a goal is collected, is only outlined
      h('div', { class: 'hq-days', role: 'img', 'aria-label': `Day ${s.count} of ${STREAK.cap}, ${s.claimed ? 'counted' : 'not counted yet'}` },
        ...Array.from({ length: STREAK.cap }, (_, i) => h('span', { class: 'hq-day' + (i < s.count - 1 || (s.claimed && i < s.count) ? ' on' : i === s.count - 1 ? ' next' : ''), text: String(i + 1) }))),
      h('div', { class: 'hq-sub', text: say }),
      note(`Each day in a row adds ${pct(STREAK.step)}% to the first daily goal you collect that day, up to ${top}% on day ${STREAK.cap}. A missed day takes one day off the streak. Best so far: ${days(s.best)}.`));
    // The swap: one daily goal a day, for another kind the company can finish.
    const open = c.goalList('daily').filter(g => !g.claimed && !g.done);
    const text = g => { const kind = GOALS.kinds.find(k => k.id === g.kind); return g.target === 1 && kind.one ? kind.one : kind.text.replace('{n}', kind.money ? money(g.target) : fmt(g.target)); };
    // a goal counted in money names its exact amount like every other figure on the screen
    const goalLine = g => { const kind = GOALS.kinds.find(k => k.id === g.kind); if (!kind.money) return h('span', { text: text(g) }); const [before, after] = kind.text.split('{n}'); return h('span', {}, before, exact(g.target), after); };
    const swap = h('article', { class: 'hq-card swap' },
      h('header', {}, h('h4', {}, icon('swap'), h('span', { text: 'Swap a goal' })),
        h('span', { class: 'hq-chip ' + (c.canSwap() ? '' : 'dim'), text: c.canSwap() ? 'One swap today' : 'Used today' })),
      h('div', { class: 'hq-sub', text: c.canSwap() ? 'Exchange one of today\'s goals for another kind. The new goal starts at nothing and pays the same.' : 'A new swap comes with tomorrow\'s goals.' }),
      ...(c.canSwap() ? open.map(g => h('div', { class: 'hq-todo' }, goalLine(g),
        this.button_('Swap', 'swap-' + g.index, () => {
          let got = null;
          this.act('swap', () => (got = c.swapGoal(g.index)));
          this.toast(got ? 'Goal swapped' : 'There is no other goal to swap for right now');
        }, { cls: 'small' }))) : []),
      c.canSwap() && !open.length ? note('Today\'s goals are all done.') : null);
    return section('Streak and swap', streak, swap);
  }
}
