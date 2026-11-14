// The Business Headquarters screen: eleven tabs drawn from the live company state.
// Everything shown here is read from game.company (js/sim/company.js); every button calls one of its
// methods and then game.afterCompanyAction() for the sound, the confetti and the save.
// This file is the screen itself: opening and closing, the tab strip, feedback lines, scrolling and the redraw.
// Each tab, and the pieces they share, live in js/hq/ and are added to the class at the bottom.
import { fmt } from './format.js';
import { TABS, RANKS } from './data/company.js';
import { Series } from './sim/series.js';
import { icon } from './icons.js';
import { exactMoney, cleanPrefs, startTab, railKey, Line } from './sim/hqview.js';
import { HISTORY, RANKING, h, exactOn, section, note, mix } from './hq/kit.js';
import { patch } from './hq/patch.js';
import { HqHelp } from './hq/help.js';
import { HqOverview } from './hq/overview.js';
import { HqGoals } from './hq/goals.js';
import { HqPeople } from './hq/people.js';
import { HqBusinesses } from './hq/businesses.js';
import { HqContracts } from './hq/contracts.js';
import { HqResearch } from './hq/research.js';
import { HqLogistics } from './hq/logistics.js';
import { HqFinance } from './hq/finance.js';
import { HqMarket } from './hq/market.js';
import { HqBuild } from './hq/build.js';
import { HqRecords } from './hq/records.js';
import { HqAdvisor } from './hq/advisor.js';

export { patch };   // tests, and anything that draws a list the same way

const $ = id => document.getElementById(id);
const REDRAW = 0.5;   // seconds between redraws while open
const PRIMARY = ['overview', 'goals', 'contracts', 'finance'];   // the tabs that sit in the bottom bar on a phone
const PREFS_KEY = 'lumber-tycoon-hq';             // what the screen remembers on this device: the tab, the orderings, the chart range
const TOAST = { alone: 3200, queued: 2000 };      // milliseconds a line of feedback stays: shorter while others wait behind it
const TOP_AFTER = 400;                            // pixels scrolled before "back to top" is offered
// The icon in front of a line of feedback, by the action (act) or the company event (main.js, celebrate) it is about.
const TOAST_ICON = { deliver: 'contracts', delivered: 'contracts', ready: 'contracts', research: 'research', route: 'logistics', hire: 'team',
  goal: 'goals', sell: 'coin', founded: 'hq', milestone: 'award', achievement: 'award', rank: 'star',
  build: 'construction', send: 'construction', site: 'construction', stage: 'construction', built: 'construction' };

function readPrefs() {
  try { return cleanPrefs(JSON.parse(localStorage.getItem(PREFS_KEY))); } catch { return cleanPrefs(null); }   // private mode, or nothing stored
}

export class Headquarters {
  constructor(game) {
    this.game = game; this.company = game.company;
    this.isOpen = false; this.tab = 'overview'; this.timer = 0; this.holding = false; this.confirm = null;
    this.board = null;   // the leaderboard as last fetched: { data, at } | { loading } | { error }
    this.el = $('hq'); this.body = $('hq-body'); this.tabs = $('hq-tabs'); this.button = $('hq-btn');
    this.history = new Series(HISTORY); this.seenAge = 0;   // income and costs over the last ten minutes of play
    this.chartAt = null;                                    // which chart is being read and where: { key, f }, f from 0 (oldest) to 1 (now)
    this.more = false;                                      // on a phone: the list behind More is open
    this.prefs = readPrefs(); this.tab = this.prefs.tab;    // remembered on this device: the tab, the orderings, the chart range
    this.scrolls = {};                                      // how far each tab was scrolled, to come back to the same place
    this.line = new Line(3); this.acting = null; this.batch = null;   // the line of feedback: what is on screen and what waits
    this.yardHistory = new Series(HISTORY);                 // profit per yard, sampled together with the Finance history
    this.tables = {};                                       // which charts have their table of numbers open
    this.boardBusy = false; this.boardCall = 0;             // the ranking is being fetched; which call is the newest
    this.helpOpen = null;                                   // the tab whose "How it works" card is open
    this.tourAt = null;                                     // the card of the tour on screen (0 to 2), or null
    this.unfold = {};                                       // lists shown in full: { badges, routes }
    this.button.addEventListener('click', () => this.open());
    $('hq-close').addEventListener('click', () => this.close());
    this.el.addEventListener('click', e => { if (e.target === this.el) this.close(); });
    addEventListener('keydown', e => this.onKey(e));
    // A redraw may change the button under a finger, so it waits while a finger or the mouse is down on the screen.
    this.el.addEventListener('pointerdown', () => { this.holding = true; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.el.addEventListener(ev, () => { this.holding = false; });
    // The cash in the header: the short figure to read, the exact one for the mouse and a screen reader.
    this.cashShort = h('span', { 'aria-hidden': 'true' }); this.cashFull = h('span', { class: 'hq-sr' });
    $('hq-cash').replaceChildren(this.cashShort, this.cashFull);
    // "Back to top" sits over the body, outside what is redrawn, and shows once the tab is scrolled down.
    this.topBtn = h('button', { class: 'hq-top', 'aria-label': 'Back to top', title: 'Back to top', hidden: true, onclick: () => this.toTop() }, icon('up'));
    this.body.parentNode.parentNode.append(this.topBtn);
    this.body.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.sync();
  }

  /** Show the button once the company exists, with a marker while a contract waits to be delivered. */
  sync() {
    const c = this.company;
    this.button.hidden = !c.founded;
    $('hq-dot').hidden = !(c.active.some(x => c.ready(x)) || c.goalsWaiting() > 0 || c.siteFlag());   // an order to deliver, a reward to collect, or a build to start
  }
  open(tab) {
    if (!this.company.founded) return;
    // Reopening shows the tab that was open last, also after a reload. One that is locked now, or gone, gives way to Overview.
    this.tab = tab || startTab(this.tab, TABS.map(t => t.id), id => !!this.company.tabLock(id));
    this.startTour();
    this.isOpen = true; this.el.hidden = false; this.timer = 0; this.holding = false;
    this.game.onHqToggle(true);
    this.render();
    this.restoreScroll();
    this.showTab();
    if (this.tab === 'ranking') this.loadBoard();
    $('hq-close').focus({ preventScroll: true });
  }
  close() {
    if (!this.isOpen) return;
    this.keepScroll();
    this.isOpen = false; this.el.hidden = true; this.confirm = null;
    this.line.clear(); clearTimeout(this.toastTimer); $('hq-toast').hidden = true;   // feedback about a closed screen would arrive out of nowhere
    this.game.onHqToggle(false);
    this.button.focus({ preventScroll: true });
  }
  /** Keep the history for the Finance chart, whether or not the screen is open. */
  sample() {
    const c = this.company;
    if (!c.founded) return;
    if (c.age < this.seenAge) { this.history.clear(); this.yardHistory.clear(); }   // a new company
    const dt = c.age - this.seenAge; this.seenAge = c.age;
    if (c.age < HISTORY.warmup) return;               // the per-minute figures are still being measured
    this.history.add(dt, () => { const s = c.summary(); return { income: s.income, costs: s.costs, value: s.valuation }; });
    // Profit per open yard for the trend lines of the Businesses tab: one pass over the yards every five seconds, nothing in between.
    this.yardHistory.add(dt, () => { const p = {}; for (const id of this.game.econ.areas) p[id] = c.yardReport(id).profit; return p; });
  }
  tick(dt) {
    this.sync();
    this.sample();
    if (!this.isOpen) return;
    this.timer += dt;
    if (this.timer < REDRAW || this.holding || this.typing()) return;
    this.timer = 0;
    if (this.tab === 'ranking' && this.board?.at && !this.boardBusy && Date.now() - this.board.at > RANKING.every) this.loadBoard();   // keep the list fresh while it is watched
    this.render();
  }
  /** A field is being typed in: a redraw could take the caret and the half-written text with it. */
  typing() {
    const a = document.activeElement;
    return !!a && a !== document.body && this.el.contains(a) && (a.isContentEditable || a.tagName === 'TEXTAREA'
      || (a.tagName === 'INPUT' && !/^(button|checkbox|radio|range|submit|reset|color|file)$/.test(a.type)));
  }
  /** What is in the body right now: a tab, or on a phone the list behind More. */
  get view() { return this.more ? 'more' : this.tab; }
  keepScroll() { this.scrolls[this.view] = this.body.scrollTop; }
  restoreScroll() { this.body.scrollTop = this.scrolls[this.view] || 0; this.onScroll(); }
  /** Offer "back to top" once the tab is scrolled down. Runs on every scroll event, so it only compares and flips one flag. */
  onScroll() {
    const far = this.body.scrollTop > TOP_AFTER;
    if (this.topBtn.hidden === far) {
      this.topBtn.hidden = !far;
      if (far) this.topBtn.style.top = ((this.body.offsetTop || 0) + 2) + 'px';   // in the strip where the section heading sticks
    }
  }
  toTop() {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.body.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
    this.tabs.querySelector('.on')?.focus({ preventScroll: true });   // the button is about to hide: the focus must not be left on it
  }
  go(tab) {
    this.keepScroll();
    this.tab = tab; this.more = false; this.confirm = null; this.chartAt = null;
    this.setPref('tab', tab, false);
    this.body.replaceChildren();   // another tab is drawn from nothing, not mended out of this one
    this.render(); this.restoreScroll(); this.showTab();
    if (tab === 'ranking') this.loadBoard();
  }
  /** On a phone: open or close the list of the tabs that do not fit in the bar. */
  toggleMore() { this.keepScroll(); this.more = !this.more; this.confirm = null; this.body.replaceChildren(); this.render(); this.restoreScroll(); }
  /** Remember a choice on this device, and redraw unless told not to. */
  setPref(name, value, redraw = true) {
    this.prefs[name] = value;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* private mode: the choice lasts until the page is closed */ }
    if (redraw) this.render();
  }
  /**
   * The keyboard: Escape closes; 1 to 9 and 0 open the first ten tabs; on a wide screen up and down walk
   * the rail. Nothing is taken from a field that is being typed in. (The arrow keys never scroll this
   * screen: js/input.js keeps them from scrolling the page for the whole game.)
   */
  onKey(e) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') { this.close(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const at = e.target instanceof HTMLElement ? e.target : null;
    if (at && (at.isContentEditable || at.matches('input, textarea, select'))) return;
    const arrow = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (arrow && matchMedia('(max-width: 759px)').matches) return;   // a phone has no rail to walk
    const next = railKey(e.key, TABS.map(t => t.id), this.tab);
    if (!next) return;
    e.preventDefault();
    if (next !== this.tab || this.more) this.go(next);
    if (arrow) this.tabs.querySelector(`[data-key="tab-${next}"]`)?.focus({ preventScroll: true });   // so the next arrow carries on from here
  }
  /** Keep the chosen tab in view in the strip of tabs. */
  showTab() { this.tabs.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  /**
   * One line of feedback at the bottom of the screen, for a few seconds. Several in a row are shown one
   * after another, each with an icon for what it is about.
   * @param kind  what it is about, when it is not the action being run: a company event (main.js, celebrate)
   */
  toast(text, kind) {
    const message = { text, icon: TOAST_ICON[kind || this.acting] || 'check', own: !kind };
    if (this.batch) this.batch.push(message);
    else if (this.line.add(message)) this.showToast();
  }
  /** Put the message whose turn it is on screen, and come back when its time is up. */
  showToast() {
    const el = $('hq-toast'), m = this.line.now;
    clearTimeout(this.toastTimer);
    if (!m) { el.hidden = true; return; }
    const ms = this.line.waiting.length ? TOAST.queued : TOAST.alone;
    el.replaceChildren(icon(m.icon), h('span', { text: m.text }));
    el.style.animationDuration = ms + 'ms';
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    this.toastTimer = setTimeout(() => { this.line.next(); this.showToast(); }, ms);
  }
  /** Run a company action, let the game react, redraw. */
  act(kind, fn) {
    const result = fn();
    // What the game says about this press is collected first: the line about the action itself goes
    // to the front, and what it set off (a milestone, a new rank) follows it.
    this.acting = kind; this.batch = [];
    try { this.game.afterCompanyAction(kind, result); } finally {
      const said = this.batch; this.acting = null; this.batch = null;
      let first = false;
      for (const m of [...said.filter(x => x.own), ...said.filter(x => !x.own)]) first = !!this.line.add(m) || first;
      if (first) this.showToast();
    }
    this.confirm = null;
    this.render();
  }

  render() {
    const c = this.company, rank = c.rankInfo();
    // The header changes rarely: each piece is written only when it differs from what is there.
    const put = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    const mark = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
    put($('hq-rank-icon'), String(c.rank + 1));   // the rank as a number: 1 (Worker) to 8
    mark($('hq-rank-icon'), 'aria-label', `Rank ${c.rank + 1} of ${RANKS.length}`);
    put($('hq-rank-name'), rank.name);
    const cash = this.game.econ.cash;
    put(this.cashShort, fmt(cash)); put(this.cashFull, exactMoney(cash)); mark($('hq-cash'), 'title', exactMoney(cash));
    const xp = Math.round(rank.progress * 100) + '%';
    if ($('hq-xp-fill').style.width !== xp) $('hq-xp-fill').style.width = xp;
    put($('hq-xp-text'), rank.next ? `${fmt(rank.xp)} / ${fmt(rank.next.xp)} experience to ${rank.next.name}` : `${fmt(rank.xp)} experience · top rank`);

    const focused = document.activeElement?.dataset?.key;
    // A wide screen has room for every tab in a rail at the side. A phone gets a bar at the bottom with
    // the four most used and More, which lists the rest.
    const compact = matchMedia('(max-width: 759px)').matches;
    const badge = t => (t.id === 'contracts' && c.active.some(x => c.ready(x))) || (t.id === 'goals' && c.goalsWaiting() > 0) || (t.id === 'construction' && c.siteFlag());
    const tab = t => {
      const locked = !!c.tabLock(t.id), on = t.id === this.tab && !(compact && this.more);
      const digit = TABS.indexOf(t) < 10 ? String((TABS.indexOf(t) + 1) % 10) : null;   // the key that opens it: 1 to 9, then 0
      return h('button', { class: 'hq-tab' + (on ? ' on' : '') + (locked ? ' locked' : ''), role: 'tab', 'aria-selected': on ? 'true' : 'false',
        'data-key': 'tab-' + t.id, 'aria-keyshortcuts': digit, title: !compact && digit ? `${t.name} (${digit})` : null, onclick: () => this.go(t.id) },
        h('span', { class: 'hq-tab-icon' }, icon(locked ? 'lock' : t.id)),
        h('span', { text: t.name }), badge(t) && h('span', { class: 'dot' }));
    };
    const rest = TABS.filter(t => !PRIMARY.includes(t.id));
    const buttons = (compact ? TABS.filter(t => PRIMARY.includes(t.id)) : TABS).map(tab);
    if (compact) {
      const on = this.more || rest.some(t => t.id === this.tab);
      buttons.push(h('button', { class: 'hq-tab' + (on ? ' on' : ''), 'data-key': 'tab-more', 'aria-expanded': this.more ? 'true' : 'false',
        onclick: () => this.toggleMore() },
        h('span', { class: 'hq-tab-icon' }, icon('more')), h('span', { text: 'More' }), rest.some(badge) && h('span', { class: 'dot' })));
    } else this.more = false;
    const strip = 'hq-tabs ' + (compact ? 'dock' : 'rail');   // not "bar": that is the progress bar
    if (this.tabs.className !== strip) this.tabs.className = strip;
    mark(this.tabs, 'aria-orientation', compact ? 'horizontal' : 'vertical');
    patch(this.tabs, buttons);
    const lock = c.tabLock(this.tab), def = TABS.find(t => t.id === this.tab);
    const content = this.more
      ? [section('More', h('div', { class: 'hq-menu' }, ...rest.map(t => {
        const why = c.tabLock(t.id);
        return h('button', { class: 'hq-menu-row' + (why ? ' locked' : ''), 'data-key': 'menu-' + t.id, onclick: () => this.go(t.id) },
          icon(why ? 'lock' : t.id), h('span', { class: 'hq-menu-text' }, h('b', { text: t.name }), why && h('span', { class: 'hq-sub', text: why })),
          badge(t) && h('span', { class: 'dot' }));
      })))]
      : lock ? [h('div', { class: 'hq-locked' }, h('div', { class: 'hq-locked-icon' }, icon('lock')), h('h3', { text: def.name + ' is locked' }), note(lock))]
        : this.content(this.tab);
    // Only what differs from the page is touched (see patch): the rest keeps its hover, its focus and its place.
    const top = this.body.scrollTop;
    if (patch(this.body, content.filter(Boolean)) && this.body.scrollTop !== top) this.body.scrollTop = top;
    if (focused && document.activeElement?.dataset?.key !== focused) this.el.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }
  /** @param exact  the amount of money named in the text, if any: the button then carries the exact figure */
  button_(text, key, onclick, { cls = '', disabled = false, exact = null } = {}) {
    const el = h('button', { class: 'hq-btn ' + cls, 'data-key': key, disabled, onclick, text });
    return exact == null ? el : exactOn(el, text, exact);
  }
  /** A choice between a few things, as a row of small buttons: the chosen one is marked for the eye and for a screen reader. */
  choice(key, name, options, value, pick) {
    return h('div', { class: 'hq-seg', role: 'group', 'aria-label': name }, ...options.map(([id, text]) =>
      h('button', { class: 'hq-seg-btn' + (id === value ? ' on' : ''), 'aria-pressed': id === value ? 'true' : 'false', 'data-key': `${key}-${id}`, onclick: () => pick(id), text })));
  }
  /** A switch: on or off, said with a tick and not by colour alone. */
  switch_(text, key, on, flip) {
    return h('button', { class: 'hq-seg-btn hq-switch' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-key': key, onclick: flip },
      on && icon('check'), h('span', { text }));
  }

  /** Everything a tab shows: the tour on Overview while it runs, the tab's "How it works", then the tab itself. */
  content(tab) {
    return [tab === 'overview' ? this.tourCard() : null, this.helpBlock(tab), ...this[tab]()];
  }
}

mix(Headquarters, HqHelp, HqOverview, HqGoals, HqPeople, HqBusinesses, HqContracts, HqResearch, HqLogistics, HqFinance, HqMarket, HqBuild, HqRecords, HqAdvisor);
