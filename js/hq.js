// The Business Headquarters screen: eleven tabs drawn from the live company state.
// Everything shown here is read from game.company (js/sim/company.js); every button calls one of its
// methods and then game.afterCompanyAction() for the sound, the confetti and the save.
import { saveFile } from './files.js';
import { fmt } from './format.js';
import { TABS, RANKS, RESEARCH, CATEGORIES, MILESTONES, MEASURES, LOCATIONS, CONTRACTS, STAFF, GOALS, ACHIEVEMENTS, PRESTIGE, MARKET, milestoneText } from './data/company.js';
import { kindOf } from './sim/company.js';
import { AREAS, ITEMS } from './data/areas.js';
import { Series, niceMax } from './sim/series.js';
import { icon } from './icons.js';
import { STAFF_RULES, FINANCE } from './data/company.js';
import { exactMoney, isShortened, cleanPrefs, startTab, railKey, Line, orderYards, sparkLine, fillTime, fillText, orderOffers, modRows, routesWithin,
  lastSeconds, thin, incomeRows, countdown, sinceText } from './sim/hqview.js';
// for the cards and tabs at the end of the class ("more to do": records, the streak, the Advisor, the backup)
import { STREAK, CLIENTS, RUSH } from './data/company.js';
import { cleanName, clockText, NAME_MAX } from './sim/company.js';
import { advise, ADVICE } from './sim/advice.js';
import { exportSave, importSave, backupName } from './sim/backup.js';

const $ = id => document.getElementById(id);
const REDRAW = 0.5;   // seconds between redraws while open
const PRIMARY = ['overview', 'goals', 'contracts', 'finance'];   // the tabs that sit in the bottom bar on a phone
const HISTORY = { every: 5, keep: 120, warmup: 45 };   // the Finance chart: a sample every 5 s, ten minutes kept, none while the figures settle
const SVG = 'http://www.w3.org/2000/svg';
const PREFS_KEY = 'lumber-tycoon-hq';             // what the screen remembers on this device: the tab, the orderings, the chart range
const TOAST = { alone: 3200, queued: 2000 };      // milliseconds a line of feedback stays: shorter while others wait behind it
const TOP_AFTER = 400;                            // pixels scrolled before "back to top" is offered
const RANKING = { every: 30000, wait: 5000 };     // the list refreshes by itself this often while watched; the button rests this long after a load
// The icon in front of a line of feedback, by the action (act) or the company event (main.js, celebrate) it is about.
const TOAST_ICON = { deliver: 'contracts', delivered: 'contracts', ready: 'contracts', research: 'research', route: 'logistics', hire: 'team',
  goal: 'goals', sell: 'coin', founded: 'businesses', milestone: 'award', achievement: 'award', rank: 'star' };

/** h('div', { class: 'x', text: 'hi', onclick }, child, ...). Text only: nothing here is parsed as HTML. */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'class') el.className = v;
    // A click is kept where patch() can swap it: a button that stays on the page gets the newest handler.
    else if (k === 'onclick') { el._click = v; el.addEventListener('click', e => el._click(e)); }
    // Any other listener may hold on to the elements drawn with it (a chart and its crosshair): such an element is never mended, only replaced whole.
    else if (k.startsWith('on')) { el._bound = true; el.addEventListener(k.slice(2), v); }
    else if (k === 'width') el.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid) el.append(kid);
  return el;
}
/** The same for SVG: s('line', { x1: 0, ... }). */
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); }
  for (const kid of kids.flat()) if (kid) el.append(kid);
  return el;
}
/** What a place on the screen says while it has nothing to show: what will appear there and, where there is one, a button that leads to it. */
const empty = (text, action) => h('div', { class: 'hq-empty' }, h('p', { text }), action);

function readPrefs() {
  try { return cleanPrefs(JSON.parse(localStorage.getItem(PREFS_KEY))); } catch { return cleanPrefs(null); }   // private mode, or nothing stored
}

// --- redrawing without rebuilding -------------------------------------------------------------
// The screen is drawn again twice a second. Most of the time most of it has not changed, and replacing
// it anyway would cost time and take the hover, the focus and a tooltip from under the player. So what
// is on the page remembers the markup it was drawn with. A part whose markup is the same is left alone;
// one that differs is mended in place where it can be (attributes, a changed text, its children in the
// same way), and replaced only when its shape is different.
const built = new WeakMap();   // an element on the page -> its markup when it was drawn
/** Children are elements only, no loose text between them: they can be compared one by one. */
const plain = el => el.childNodes.length === el.children.length;
/** `was` stays on the page in place of `now`, which looks the same: hand over the click handlers, which may know newer data. */
function adopt(was, now) {
  if (now._click) was._click = now._click;
  const a = was.getElementsByTagName('button'), b = now.getElementsByTagName('button');
  for (let i = 0; i < b.length && i < a.length; i++) if (b[i]._click) a[i]._click = b[i]._click;
}
/** Turn `was` into `now` without taking it off the page. @returns false when that cannot be done and it has to be replaced */
function mend(was, now) {
  if (was._bound || now._bound || was.tagName !== now.tagName || !was._click !== !now._click) return false;
  const kids = now.children.length;
  if (was.children.length !== kids || (kids > 0 && !(plain(was) && plain(now)))) return false;   // a different shape, or text mixed with elements
  for (const a of Array.from(was.attributes)) if (now.getAttribute(a.name) === null) was.removeAttribute(a.name);
  for (const a of Array.from(now.attributes)) if (was.getAttribute(a.name) !== a.value) was.setAttribute(a.name, a.value);
  if (kids) patch(was, Array.from(now.children));
  else if (was.textContent !== now.textContent) was.textContent = now.textContent;
  if (now._click) was._click = now._click;
  return true;
}
/**
 * Make `parent` show the elements in `fresh`, touching as little of the page as possible.
 * @returns true when anything on the page was changed
 */
export function patch(parent, fresh) {
  const old = parent.children;
  if (old.length !== fresh.length) {
    for (const el of fresh) built.set(el, el.outerHTML);
    parent.replaceChildren(...fresh);
    return true;
  }
  let changed = false;
  for (let i = 0; i < fresh.length; i++) {
    const was = old[i], now = fresh[i], html = now.outerHTML;
    if ((built.get(was) ?? was.outerHTML) === html) { built.set(was, html); adopt(was, now); continue; }   // not seen before: its markup on the page speaks for it
    changed = true;
    if (mend(was, now)) built.set(was, html);
    else { built.set(now, html); was.replaceWith(now); }
  }
  return changed;
}

const money = n => (n < 0 ? '−$' + fmt(-n) : '$' + fmt(n));
const minute = perSec => money(Math.round(perSec * 60));   // a rate per second, as dollars a minute without the unit
const aMinute = perSec => Math.round(perSec * 60);         // the same as a number, for figure() and amount()
/**
 * The one place a shortened money figure ($5.2M) gets its exact number: as a title for the mouse, and as
 * hidden text that a screen reader gets in place of the short form. Below $10,000 the figure shown is
 * exact already and stays plain text. The first child is always the figure itself: the stylesheet colours it.
 */
function exact(n, cls, unit) {
  const short = h('span', { text: money(n) }), tail = unit && h('span', { class: 'fin-unit', text: unit });
  if (!isShortened(n)) return h('span', { class: cls }, short, tail);
  const full = exactMoney(n) + (unit === '/min' ? ' a minute' : unit ? ' ' + unit : '');
  short.setAttribute('aria-hidden', 'true');
  if (tail) tail.setAttribute('aria-hidden', 'true');
  return h('span', { class: cls, title: full }, short, tail, h('span', { class: 'hq-sr', text: full }));
}
/** The same for an element whose own text holds the figure, a button mostly: the exact number as its title and in its label. */
function exactOn(el, text, n) {
  if (!isShortened(n)) return el;
  el.setAttribute('title', exactMoney(n));
  el.setAttribute('aria-label', text.replace(money(n), exactMoney(n)));
  return el;
}
/** A money amount inside a sentence, a row or a cell. */
const amount = (n, cls = '') => exact(n, ('hq-amt ' + cls).trim());
/** A sentence that has the figure for `n` in it, as text and elements, so that the figure carries its exact number. */
const withAmount = (text, n) => {
  const short = money(n), i = isShortened(n) ? text.indexOf(short) : -1;
  return i < 0 ? [text] : [text.slice(0, i), amount(n), text.slice(i + short.length)].filter(Boolean);
};
/** "3 of 10" under a progress bar; with money, both figures carry their exact number. */
const ofLine = (value, target, isMoney) => h('div', { class: 'hq-sub' }, ...(isMoney ? [amount(value), ' of ', amount(target)] : [`${fmt(value)} of ${fmt(target)}`]));
/** A figure with its unit as a separate, smaller piece: $5.2M /min. A number is money and gets its exact figure; text is shown as it is. */
const figure = (value, unit) => (typeof value === 'number' ? exact(value, 'fin-figure', unit)
  : h('span', { class: 'fin-figure' }, h('span', { text: value }), unit && h('span', { class: 'fin-unit', text: unit })));
const ago = sec => (sec < 3 ? 'now' : sec < 60 ? `${Math.round(sec)} s ago` : `${Math.floor(sec / 60)} min${Math.round(sec % 60) ? ` ${Math.round(sec % 60)} s` : ''} ago`);
const perMin = n => money(Math.round(n * 60)) + '/min';
const bar = (value, cls = '') => h('div', { class: 'bar ' + cls }, h('div', { class: 'fill', width: value }));
const label = item => ITEMS[item].label;
const needText = ([item, qty]) => `${qty} ${label(item)}`;
const yardName = id => AREAS.find(a => a.id === id).name;
const cap = text => text[0].toUpperCase() + text.slice(1);
/** A rate per second as a figure per minute: $5.2M /min. */
const rate = perSec => figure(aMinute(perSec), '/min');
/** One headline number: its name, the figure, and an optional line under it. tone: up, down or gold. */
const kpi = (name, value, unit, under, tone = '') => h('div', { class: 'fin-kpi ' + tone },
  h('div', { class: 'fin-label', text: name }), h('div', { class: 'fin-value' }, figure(value, unit)), under);
const sub = (...kids) => h('div', { class: 'fin-trend' }, ...kids);
/** A small label; mark is the name of an icon to put in front (check, lock). */
const chip = (text, tone = '', mark) => h('span', { class: 'hq-chip ' + tone }, mark && icon(mark), h('span', { text }));
const marked = (name, text) => h('span', { class: 'hq-marked' }, icon(name), h('span', { text }));
// Which icon stands for what is counted: milestones by measure, goals by kind.
const MEASURE_ICON = { yards: 'businesses', workers: 'team', income: 'coin', contracts: 'contracts', research: 'research', routes: 'logistics',
  market: 'market', goodPrice: 'market', sold: 'store', peak: 'coin', rush: 'clock' };
const KIND_ICON = { income: 'coin', sold: 'store', contracts: 'contracts', upgrades: 'upgrade', trucked: 'logistics', research: 'research' };
const section = (title, ...kids) => h('section', { class: 'hq-section' }, h('h3', { text: title }), ...kids);
const note = (...parts) => h('p', { class: 'hq-note' }, ...parts);   // text, or text and figures in order
const row = (name, value, cls = '') => h('div', { class: 'hq-row ' + cls }, h('span', { text: name }), h('b', {}, value));   // value: text or a figure

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
    $('hq-dot').hidden = !(c.active.some(x => c.ready(x)) || c.goalsWaiting() > 0);   // an order to deliver or a reward to collect
  }
  open(tab) {
    if (!this.company.founded) return;
    // Reopening shows the tab that was open last, also after a reload. One that is locked now, or gone, gives way to Overview.
    this.tab = tab || startTab(this.tab, TABS.map(t => t.id), id => !!this.company.tabLock(id));
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
    const badge = t => (t.id === 'contracts' && c.active.some(x => c.ready(x))) || (t.id === 'goals' && c.goalsWaiting() > 0);
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
      : lock ? [h('div', { class: 'hq-locked' }, h('div', { class: 'hq-locked-icon' }, icon('lock')), h('h3', { text: def.name + ' is locked' }), note(lock))] : this[this.tab]();
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
    return [
      h('div', { class: 'fin-kpis' },
        kpi('Company value', s.valuation, '', null, 'gold'),
        kpi('Profit', aMinute(s.profit), '/min', null, s.profit < 0 ? 'down' : 'up'),
        kpi('Income', aMinute(s.income), '/min'),
        kpi('Costs', aMinute(s.costs), '/min'),
        kpi('Yards', String(this.game.econ.areas.length), `of ${AREAS.length}`),
        kpi('Employees', String(staff.workers)),
        kpi('Contracts delivered', String(c.stats.contracts)),
        kpi('Research done', String(Object.values(c.research).reduce((a, b) => a + b, 0)))),
      this.firstSteps(),
      section('Needs your attention', ...(todo.length ? todo : [empty('Nothing needs you right now. Orders to deliver, rewards to collect and routes to buy are listed here.')])),
      section('Next milestones', ...this.milestones(3)),
    ];
  }
  /** The first five things to do with a new company, with the next one pointed out. Gone once all are done. */
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
    return section(`First steps · ${done} of ${steps.length}`, h('div', { class: 'hq-steps' }, ...steps.map(([name, why, ok, tab], i) => {
      const lock = c.tabLock(tab);
      return h('div', { class: 'hq-goal' + (ok ? ' done' : i === next ? ' next' : '') },
        h('span', { class: 'hq-goal-icon' }, icon(ok ? 'check' : 'dot')),
        h('div', { class: 'hq-goal-body' }, h('div', { class: 'hq-goal-text', text: name }), ok ? null : h('div', { class: 'hq-sub', text: lock || why })),
        !ok && i === next && !lock ? this.button_('Show me', 'step-' + i, () => this.go(tab), { cls: 'primary small' }) : null);
    })));
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

  // --- Goals ------------------------------------------------------------------------
  goalCard(g) {
    const kind = GOALS.kinds.find(k => k.id === g.kind), show = v => (kind.money ? money(v) : fmt(v));
    const text = g.target === 1 && kind.one ? kind.one : kind.text.replace('{n}', show(g.target));
    return h('article', { class: 'hq-card goal' + (g.claimed ? ' done' : g.done ? ' ready' : '') },
      h('header', {}, h('h4', {}, icon(KIND_ICON[g.kind] || 'goals'), h('span', {}, ...(kind.money ? withAmount(text, g.target) : [text]))), h('span', { class: 'hq-xp-chip', text: `+${g.xp} XP` })),
      g.claimed ? null : h('div', { class: 'hq-need' }, bar(g.value / Math.max(g.target, 1)),
        h('b', {}, ...(kind.money ? [amount(g.value), ' / ', amount(g.target)] : [`${fmt(g.value)} / ${fmt(g.target)}`]))),
      g.claimed ? chip('Collected', 'good', 'check')
        : h('div', { class: 'hq-actions' }, this.button_(`${g.done ? 'Collect' : 'Reward'} ${money(g.cash)}`, `goal-${g.period}-${g.index}`,
          () => this.act('goal', () => this.company.claimGoal(g.period, g.index)), { cls: 'primary', disabled: !g.done, exact: g.cash })));
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
    const cards = (period, waiting) => { const list = c.goalList(period); return list.length ? list.map(g => this.goalCard(g)) : [empty(waiting)]; };
    return [
      ready.list.length > 1 ? h('div', { class: 'hq-todo good' }, marked('goals', `${ready.list.length} rewards are ready`),
        this.button_(`Collect all ${money(ready.cash)}`, 'goal-all', () => this.collectAll(), { cls: 'primary', exact: ready.cash })) : null,
      event ? section(`${event.name} · until ${event.until}`, note(event.desc + '.'), ...c.goalList('event').map(g => this.goalCard(g))) : null,
      section(`Today · new goals in ${countdown(midnight)}`, ...cards('daily', 'Three goals for the day appear here, with new ones every midnight.'), bonus),
      this.streakSection(),
      section(`This week · new goals in ${countdown(monday)}`, ...cards('weekly', 'Three goals for the week appear here, with new ones every Monday.'),
        note('Goals you do not finish are simply replaced. Nothing is lost.')),
      section(`Achievements · ${done} of ${ACHIEVEMENTS.length}`, ...ACHIEVEMENTS.map(a => {
        const got = !!c.badges[a.id], value = got ? a.at : Math.min(c.achieved(a.measure), a.at);
        return h('div', { class: 'hq-goal' + (got ? ' done' : '') },
          h('span', { class: 'hq-goal-icon' }, icon(got ? 'check' : 'award')),
          h('div', { class: 'hq-goal-body' }, h('div', { class: 'hq-goal-text', text: a.name }), h('div', { class: 'hq-sub' }, ...(a.money ? withAmount(a.desc, a.at) : [a.desc])),
            got || a.at <= 4 ? null : bar(value / a.at), got || a.at <= 4 ? null : ofLine(value, a.at, a.money)),
          h('span', { class: 'hq-xp-chip', text: `+${a.xp} XP` }));
      })),
    ];
  }

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

  // --- Businesses ----------------------------------------------------------------
  /**
   * One yard's profit over the last ten minutes of play as a small line: above the zero mark it earns,
   * below it loses. Drawn from the history sample() keeps; nothing until there are two samples.
   */
  trend(id) {
    const all = this.yardHistory?.points || [], newest = all[all.length - 1], W = 120, H = 28;
    if (!newest) return null;
    // The line only changes with a new sample, every five seconds: it is worked out then and reused by the redraws in between.
    const kept = (this.trends ||= new Map());
    let c = kept.get(id);
    if (!c || c.t !== newest.t) {
      const pts = all.filter(p => p[id] != null);   // a yard opened later has a shorter history
      c = { t: newest.t, line: null };
      if (pts.length >= 2) {
        const first = pts[0], last = pts[pts.length - 1];
        c.line = sparkLine(pts.map(p => p[id]), W, H);
        c.minutes = Math.max(1, Math.round((last.t - first.t) / 60));
        c.tone = last[id] < 0 ? 'down' : 'up';
        c.text = `Profit over the last ${c.minutes} min: from ${exactMoney(aMinute(first[id]))} to ${exactMoney(aMinute(last[id]))} a minute`;
      }
      kept.set(id, c);
    }
    if (!c.line) return null;
    return { minutes: c.minutes, svg: s('svg', { class: 'hq-spark ' + c.tone, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': c.text },
      s('title', { text: c.text }), s('line', { class: 'hq-spark-zero', x1: 0, x2: W, y1: c.line.zero, y2: c.line.zero }), s('polyline', { points: c.line.points })) };
  }
  businesses() {
    const c = this.company, econ = this.game.econ, p = this.prefs;
    const measuring = c.age < 45;   // the per-minute figures need a little while after loading
    const open = AREAS.filter(a => econ.areaOpen(a.id)).map(a => { const r = c.yardReport(a.id); return { a, r, name: a.name, profit: r.profit }; });
    const shown = orderYards(open, p.yards).filter(y => !p.losing || (y.profit < 0 && !measuring));
    const controls = h('div', { class: 'hq-controls' },
      this.choice('yards-by', 'Order the yards by', [['built', 'Build order'], ['profit', 'Profit'], ['name', 'Name']], p.yards, v => this.setPref('yards', v)),
      this.switch_('Losing money only', 'yards-losing', p.losing, () => this.setPref('losing', !this.prefs.losing)));
    const cards = shown.map(({ a, r }) => {
      const next = econ.nextUpgrade(a.id), trend = this.trend(a.id);
      const idle = r.income < 0.01, loss = r.profit < 0 && !measuring;
      const status = measuring ? ['Measuring…', ''] : idle && r.total < 0.01 ? ['Starting up', ''] : loss ? ['Losing money', 'bad'] : ['Profitable', 'good'];
      const costName = { materials: 'materials', wages: 'wages', upkeep: 'machine upkeep' }[r.biggest];
      const scale = Math.max(r.income, r.total, 1e-9);
      return h('article', { class: 'hq-card' },
        h('header', {}, h('h4', { text: a.name }), h('span', { class: 'hq-chip ' + status[1], text: status[0] })),
        h('div', { class: 'hq-sub', text: `${r.workers} worker${r.workers === 1 ? '' : 's'} · ${r.machines} machine${r.machines === 1 ? '' : 's'}` }),
        h('div', { class: 'hq-bars' },
          h('div', { class: 'hq-bar-row' }, h('span', { text: 'Income' }), bar(r.income / scale, 'income'), h('b', {}, rate(r.income))),
          h('div', { class: 'hq-bar-row' }, h('span', { text: 'Costs' }), bar(r.total / scale, 'costs'), h('b', {}, rate(r.total)))),
        h('div', { class: 'hq-row hq-trend ' + (loss ? 'bad' : r.profit > 0 && !measuring ? 'good' : '') },
          h('span', {}, 'Profit', trend && h('span', { class: 'hq-trend-span', text: ` · last ${trend.minutes} min` })), trend?.svg, h('b', {}, rate(r.profit))),
        h('div', { class: 'hq-split' },
          r.supplied > 0.01 ? h('span', {}, 'Supplies other yards: ', rate(r.supplied)) : null,
          r.stocked > 0.01 ? h('span', {}, 'To the warehouse: ', rate(r.stocked)) : null,
          r.costs.materials > 0.01 ? h('span', {}, 'Materials: ', rate(r.costs.materials)) : null,
          h('span', {}, 'Wages: ', rate(r.costs.wages)),
          h('span', {}, 'Upkeep: ', rate(r.costs.upkeep))),
        loss && !idle ? note(`This yard costs more than it brings in. Its largest cost is ${costName}.`) : null,
        loss && idle && r.total > 0.01 ? note('Nothing sold here in the last minute, but wages and upkeep are still paid.') : null,
        next ? h('div', { class: 'hq-next' },
          h('span', { text: `Next: ${next.label}` }),
          bar((next.cost - econ.remaining(next.id)) / next.cost),
          h('b', {}, amount(next.cost))) : h('div', { class: 'hq-next done' }, icon('check'), h('span', { text: 'Fully built' })));
    });
    const locked = AREAS.length - open.length;
    return [controls, ...cards,
      cards.length ? null : empty('No yard is losing money. A yard that costs more than it brings in is listed here.', this.button_('Show all yards', 'yards-all', () => this.setPref('losing', false))),
      locked ? note(`${locked} more yard${locked === 1 ? '' : 's'} to open. Walk to a yard's gate to expand.`) : null];
  }

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
    return h('article', { class: 'hq-card contract' + (ready ? ' ready' : '') },
      h('header', {}, h('h4', { text: x.client }), h('span', { class: 'hq-chip', text: kind.name })),
      ...x.needs.map(n => {
        const have = Math.min(c.stock[n[0]] || 0, n[1]);
        return h('div', { class: 'hq-need' }, h('span', { text: needText(n) }),
          running ? bar(have / n[1]) : null, running ? h('b', { text: `${have} / ${n[1]}` }) : null);
      }),
      ready ? null : this.fillRow(x, running),
      h('div', { class: 'hq-reward' },
        amount(reward.cash, 'cash'),
        h('span', { text: `+${Math.round((reward.cash / reward.value - 1) * 100)}% over selling` }),
        h('span', { text: `+${reward.xp} XP` }), h('span', { text: `+${reward.rep} reputation` })),
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
    return [
      note('A client orders goods. While a contract runs, the goods it needs go to your warehouse instead of being sold, and the delivery pays more than selling them.'),
      h('div', { class: 'hq-rows' }, row('Reputation', `${c.rep} · contracts pay +${bonus.toFixed(1)}%`), row('Contracts at once', String(c.slots))),
      section('Running', ...(c.active.length ? c.active.map(x => this.contractCard(x, true))
        : [empty('No order is running. An offer you accept fills here from what your yards bring to the shops.')])),
      section('Offers',
        offers.length > 1 ? this.choice('offers-by', 'Order the offers by', [['reward', 'Reward'], ['rate', 'Reward per minute'], ['time', 'Time to fill']], this.prefs.offers, v => this.setPref('offers', v)) : null,
        ...(offers.length ? offers.map(o => this.contractCard(o.x, false))
          : [empty('No client is asking yet. Offers appear here once your yards bring goods to the shops.', this.button_('See your yards', 'go-businesses', () => this.go('businesses')))]),
        this.button_(wait > 0 ? `New offers in ${wait} s` : 'Show me new offers', 'new-offers', () => this.act('offers', () => c.newOffers()), { disabled: wait > 0 })),
    ];
  }

  // --- Research -----------------------------------------------------------------------
  /** What is in force for the whole company right now, read from its modifiers: the sum of everything researched, hired and earned. */
  inForce() {
    const c = this.company, rows = modRows(c.mods, c);
    return section('In force now',
      rows.length ? h('div', { class: 'hq-rows' }, ...rows.map(r => row(r.name, r.value)))
        : empty('Nothing is in force yet. What your research adds up to is listed here: faster machines, higher prices, lower costs.'),
      rows.length ? note('Everything that counts together: research, managers, legacy stars and an event while it runs.') : null);
  }
  research() {
    const c = this.company, cash = this.game.econ.cash;
    return [this.inForce(), ...Object.entries(CATEGORIES).map(([id, cat]) => {
      const nodes = RESEARCH.filter(r => r.cat === id);
      if (!nodes.length) return null;
      return section(cat.name, ...nodes.map(r => {
        const st = c.researchState(r);
        const state = st.done ? 'done' : st.lock ? 'locked' : st.affordable ? 'ready' : '';
        const level = st.max > 1 ? ` · level ${st.level} of ${st.max}` : '';
        // A technology that is open but too dear shows how much of its price is already there.
        const saved = !st.done && !st.lock && !st.affordable ? Math.floor(Math.max(0, cash) / st.cost * 100) : null;
        return h('article', { class: 'hq-card research ' + state },
          h('div', { class: 'hq-research-text' }, h('h4', { text: r.name + level }), h('div', { class: 'hq-sub', text: r.desc }),
            saved == null ? null : h('div', { class: 'hq-afford' }, bar(saved / 100), h('span', { class: 'hq-sub', text: `You have ${saved}% of the price` }))),
          st.done ? chip('Done', 'good', 'check')
            : st.lock ? chip(st.lock, '', 'lock')
              : this.button_(money(st.cost), 'research-' + r.id, () => this.act('research', () => c.buyResearch(r.id) && r), { cls: 'primary', disabled: !st.affordable, exact: st.cost }));
      }));
    })];
  }

  // --- Logistics ------------------------------------------------------------------------
  /** The routes that could be bought with the cash on hand, all together: not owned, not locked, cheapest first. */
  routesToBuy() {
    const c = this.company;
    return routesWithin(c.routeDefs.filter(d => { const st = c.routeState(d); return !st.owned && !st.lock; }), this.game.econ.cash);
  }
  /** Buy them all: the first press says what it will cost and asks again, the second one buys. */
  buyRoutes() {
    if (this.confirm !== 'routes-all') { this.confirm = 'routes-all'; this.render(); return; }
    this.act('route', () => this.routesToBuy().list.filter(d => this.company.buyRoute(d.id)).length || null);
  }
  logistics() {
    const c = this.company, econ = this.game.econ;
    const items = [...new Set([...Object.keys(c.stock), ...c.active.flatMap(x => x.needs.map(n => n[0]))])];
    const stock = items.map(item => {
      const have = c.stock[item] || 0, reserved = Math.min(c.reserved(item), have), free = have - reserved;
      return h('div', { class: 'hq-need' }, h('span', { text: label(item) }), bar(have / c.capacity), h('b', { text: `${have} / ${c.capacity}` }),
        free > 0 ? this.button_(`Sell ${free}`, 'sell-' + item, () => this.act('sell', () => c.sellStock(item)), { cls: 'small' }) : null);
    });
    // How long each running order still needs, from what the yards made in the last minute.
    const waits = c.active.flatMap(x => x.needs.map(([item, qty]) => {
      const missing = qty - Math.min(c.stock[item] || 0, qty);
      if (missing <= 0) return null;
      const yard = c.maker[item], r = c.yardReport(yard), perSec = (r.sales + r.stocked) / Math.max(econ.price(item), 1e-9);
      const text = perSec > 0.001 ? `about ${Math.max(1, Math.ceil(missing / perSec / 60))} min at the current pace` : `nothing is reaching the ${yardName(yard)} shop right now`;
      return h('div', { class: 'hq-row' }, h('span', { text: `${missing} more ${label(item)}` }), h('b', { text }));
    })).filter(Boolean);
    const routes = c.routeDefs.map(d => {
      const st = c.routeState(d);
      return h('article', { class: 'hq-card research ' + (st.owned ? 'done' : st.lock ? 'locked' : st.affordable ? 'ready' : '') },
        h('div', { class: 'hq-research-text' },
          h('h4', { text: `${yardName(d.from)} → ${yardName(d.to)}` }),
          h('div', { class: 'hq-sub', text: st.owned ? `Carrying ${label(d.item)}: ${st.perMinute.toFixed(0)} a minute` : `Carries ${label(d.item)} to the machines, nobody has to walk` })),
        st.owned ? chip('Running', 'good', 'check')
          : st.lock ? chip(st.lock, '', 'lock')
            : this.button_(money(d.cost), 'route-' + d.id, () => this.act('route', () => c.buyRoute(d.id) && d), { cls: 'primary', disabled: !st.affordable, exact: d.cost }));
    });
    // One button for every route the cash covers, offered when that is more than one. It names the price, and asks again before it buys.
    const all = this.routesToBuy(), arm = this.confirm === 'routes-all', count = `${all.list.length} routes for ${money(all.total)}`;
    const buyAll = all.list.length > 1
      ? this.button_(arm ? `Tap again to buy ${count}` : `Buy ${count}`, 'routes-all', () => this.buyRoutes(), { cls: arm ? 'armed' : '', exact: all.total }) : null;
    const lab = c.tabLock('research');
    const needsTrucking = c.mods.routes ? null : h('div', { class: 'hq-todo' }, marked('research', lab ? 'Trucks come with research. ' + lab : 'Trucks need the Trucking technology'),
      lab ? null : this.button_('Open lab', 'go-research', () => this.go('research')));
    return [
      section('Warehouse', note(`Holds up to ${c.capacity} of each item. Research makes it bigger.`),
        ...(stock.length ? stock : [empty('The warehouse is empty. Goods for a running contract collect here until the order is full.',
          c.active.length ? null : this.button_('See offers', 'go-contracts', () => this.go('contracts')))])),
      waits.length ? section('Still missing for your orders', ...waits) : null,
      section('Truck routes', note(`A truck takes finished goods from one yard to the machines of the next, for ${Math.round(FINANCE.transportShare * c.mods.truckFee * 1000) / 10}% of their price.`), needsTrucking, buyAll, ...routes,
        c.stats.trucked ? row('Items trucked so far', fmt(c.stats.trucked)) : null),
    ];
  }

  // --- Finance ----------------------------------------------------------------------------
  // Figures with their unit set smaller, hairline tables, and a chart of the last ten minutes of play.
  finance() {
    const c = this.company, econ = this.game.econ, s = c.summary();
    const before = this.history.ago(60);   // a minute of play earlier, for the trends
    const trend = (now, then) => {
      if (then == null) return sub();
      const base = Math.abs(then), pct = base > 1e-9 ? (now - then) / base : 0, size = Math.abs(pct) * 100;
      const dir = size < 0.1 ? 'flat' : pct > 0 ? 'up' : 'down';
      return sub(icon(dir), h('span', { text: dir === 'flat' ? 'steady this minute' : `${size >= 10 ? Math.round(size) : size.toFixed(1)}% in a minute` }));
    };
    const frow = (name, value, cls = '') => h('div', { class: 'fin-row ' + cls }, h('span', { class: 'fin-name', text: name }), value);
    const fsection = (title, ...kids) => h('section', { class: 'fin-section' }, h('h3', { text: title }), ...kids);
    const costs = [['Wages', s.wages], ['Salaries', s.salaries], ['Machine upkeep', s.upkeep], ['Trucks', s.transport]];
    const yards = AREAS.filter(a => econ.areaOpen(a.id)).map(a => {
      const r = c.yardReport(a.id);
      const invested = a.upgrades.reduce((sum, u) => sum + (econ.paid[u.id] || 0), 0);
      return { name: a.name, r, invested };
    }).sort((x, y) => y.r.profit - x.r.profit);
    const span = min => (min >= 120 ? `${Math.round(min / 60)} h` : `${Math.max(1, Math.round(min))} min`);
    const most = Math.max(1e-9, ...yards.map(y => Math.abs(y.r.profit)));
    const payback = y => (y.r.profit > 0.001 && y.invested > 0 ? `pays back in ${span(y.invested / y.r.profit / 60)}` : y.r.profit <= 0 ? 'not paying back' : '');
    // Where the cash comes from: each yard's own sales, and what deliveries and the warehouse brought in.
    const sources = incomeRows(yards.map(y => ({ name: y.name, sales: y.r.sales })), s.income), quiet = yards.filter(y => !(y.r.sales > 0)).length;
    return [
      h('div', { class: 'fin-kpis' },
        kpi('Income', aMinute(s.income), '/min', trend(s.income, before?.income)),
        kpi('Costs', aMinute(s.costs), '/min', trend(s.costs, before?.costs)),
        kpi('Profit', aMinute(s.profit), '/min', s.income > 0.001 ? sub(h('span', { text: `${Math.round(s.profit / s.income * 100)}% of income` })) : sub(), s.profit < 0 ? 'down' : 'up'),
        kpi('Company value', s.valuation, '', trend(s.valuation, before?.value))),
      h('div', { class: 'hq-controls' }, h('span', { class: 'hq-sub', text: 'The charts show the last' }),
        this.choice('range', 'Time the charts show', [[120, '2 min'], [600, '10 min']], this.prefs.range, v => this.setPref('range', v))),
      this.chart({ key: 'flow', title: 'Income and costs per minute', series: [[p => p.income, 'Income', 'income'], [p => p.costs, 'Costs', 'costs']], per: 60, profit: true }),
      this.chart({ key: 'value', title: 'Company value gained in this time', series: [[(p, first) => p.value - first.value, 'Gained', 'income']] }),
      fsection('Where the money comes from',
        sources.length ? h('div', { class: 'fin-panel cols' }, ...sources.map(r => h('div', { class: 'fin-row share source' },
          h('span', { class: 'fin-name', text: r.other ? 'Contracts and warehouse' : r.name }), h('span', { class: 'fin-share' }, h('i', { width: r.share })),
          h('span', { class: 'fin-pct', text: Math.round(r.share * 100) + '%' }), rate(r.value))))
          : empty('No cash came in during the last minute. Every yard that sells is listed here with its share.'),
        sources.length && quiet ? note(`${quiet} yard${quiet === 1 ? ' sells' : 's sell'} nothing in a shop right now: what ${quiet === 1 ? 'it makes' : 'they make'} goes to other yards or to the warehouse.`) : null),
      fsection('Where the money goes',
        h('div', { class: 'fin-panel cols' }, ...costs.map(([name, v]) => {
          const share = s.costs > 0 ? v / s.costs : 0;
          return h('div', { class: 'fin-row share' }, h('span', { class: 'fin-name', text: name }), h('span', { class: 'fin-share' }, h('i', { width: share })),
            h('span', { class: 'fin-pct', text: Math.round(share * 100) + '%' }), rate(v));
        }))),
      fsection('What the company is worth',
        h('div', { class: 'fin-panel' }, frow('Cash', figure(econ.cash)), frow('Invested in yards, research and routes', figure(s.invested)),
          frow('Ten minutes of profit', figure(Math.max(0, s.profit) * 600)), frow('Company value', figure(s.valuation), 'total'))),
      fsection('Since the beginning',
        h('div', { class: 'fin-panel' }, frow('Earned', figure(c.stats.income)), frow('Paid in wages, salaries, upkeep and trucks', figure(c.stats.costs)))),
      fsection('Yards by profit',
        h('div', { class: 'fin-panel cols three' }, ...yards.map(y => h('div', { class: 'fin-row yard' + (y.r.profit < 0 ? ' down' : '') },
          h('span', { class: 'fin-yard' }, h('span', { class: 'fin-name', text: y.name }), h('span', { class: 'fin-sub', text: payback(y) })),
          h('span', { class: 'fin-share' }, h('i', { width: Math.abs(y.r.profit) / most })),   // how it compares with the best yard
          rate(y.r.profit))))),
    ];
  }

  /**
   * A line chart of the last two or ten minutes of play (the player's choice), read with a crosshair by
   * mouse, touch or arrow keys. Under it, on request, the same numbers as a table for who cannot use the chart.
   * @param key     a name for this chart, to tell the charts on one tab apart
   * @param series  the lines: [value(sample, firstSample), name, style], style being a line colour of the stylesheet
   * @param per     what to multiply by for display: 60 turns a rate per second into dollars a minute
   * @param profit  also show the first line minus the second in the readout
   */
  chart({ key, title, series, per = 1, profit = false }) {
    const pts = lastSeconds(this.history.points, this.prefs?.range || HISTORY.every * HISTORY.keep), show = v => money(Math.round(v * per));
    const full = v => exactMoney(Math.round(v * per));
    if (pts.length < 2) {
      const left = Math.ceil(HISTORY.warmup + 2 * HISTORY.every - this.company.age);
      return h('section', { class: 'fin-section' }, h('h3', { text: title }),
        h('div', { class: 'fin-panel fin-chart' }, h('p', { class: 'fin-empty', text: `The chart draws itself while the yards work. First line in ${left > 1 ? `about ${left} seconds` : 'a moment'}.` })));
    }
    const first = pts[0], last = pts[pts.length - 1], span = last.t - first.t;
    const rows = pts.map(p => series.map(([value]) => value(p, first)));   // rows[i][k]: line k at sample i
    const W = Math.max(240, Math.round(this.body.clientWidth - 58)), H = 150, L = 44, R = 6, T = 10, B = 24;   // the left margin holds the axis figures
    const all = rows.flat(), high = niceMax(Math.max(0, ...all) * per) / per, low = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(...all) * per) / per : 0;
    const x = t => L + (t - first.t) / span * (W - L - R), y = v => H - B - (Math.max(low, Math.min(high, v)) - low) / (high - low) * (H - B - T);
    const fix = n => Math.round(n * 10) / 10;
    const marks = low < 0 ? [high, 0, low] : [high, high / 2, 0];
    const svg = s('svg', { class: 'fin-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H },
      marks.map(v => s('line', { class: 'fin-grid' + (v === 0 ? ' base' : ''), x1: L, x2: W - R, y1: fix(y(v)), y2: fix(y(v)) })),
      marks.map(v => s('text', { class: 'fin-axis', x: L - 8, y: fix(y(v) + 4), 'text-anchor': 'end', text: show(v) }, isShortened(v * per) ? s('title', { text: full(v) }) : null)),
      s('text', { class: 'fin-axis', x: L, y: H - 7, text: ago(span) }),
      s('text', { class: 'fin-axis', x: W - R, y: H - 7, 'text-anchor': 'end', text: 'now' }),
      series.map(([, , style], k) => s('polyline', { class: 'fin-line ' + style, points: pts.map((p, i) => `${fix(x(p.t))},${fix(y(rows[i][k]))}`).join(' ') })),
      series.map(([, , style], k) => s('circle', { class: 'fin-end ' + style, cx: fix(x(last.t)), cy: fix(y(rows[rows.length - 1][k])), r: 3.5 })));
    const cross = s('line', { class: 'fin-cross', y1: T, y2: H - B });
    const dots = series.map(([, , style]) => s('circle', { class: 'fin-end ' + style, r: 3.5 }));
    svg.append(cross, ...dots);
    const tip = h('div', { class: 'fin-tip' });
    const at = () => (this.chartAt && this.chartAt.key === key ? this.chartAt.f : null);
    const nearest = f => { const want = first.t + f * span; return pts.reduce((best, p, i) => (Math.abs(p.t - want) < Math.abs(pts[best].t - want) ? i : best), 0); };
    const place = () => {
      const f = at(), on = f != null;
      for (const el of [cross, ...dots]) el.style.display = on ? '' : 'none';
      tip.hidden = !on;
      if (!on) return;
      const i = nearest(f), px = fix(x(pts[i].t));
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      series.forEach((line, k) => { dots[k].setAttribute('cx', px); dots[k].setAttribute('cy', fix(y(rows[i][k]))); });
      tip.replaceChildren(h('div', { class: 'fin-tip-time', text: ago(last.t - pts[i].t) }),
        ...series.map(([, name, style], k) => h('div', { class: 'fin-tip-row' }, h('i', { class: 'fin-key ' + style }), h('b', {}, amount(Math.round(rows[i][k] * per))), h('span', { text: name }))),
        profit ? h('div', { class: 'fin-tip-row' }, h('i', { class: 'fin-key' }), h('b', {}, amount(Math.round((rows[i][0] - rows[i][1]) * per))), h('span', { text: 'Profit' })) : null);
      const leftSide = px > W / 2;   // keep the readout inside the chart
      tip.style.left = leftSide ? '' : (px + 10) + 'px';
      tip.style.right = leftSide ? (W - px + 10) + 'px' : '';
    };
    const read = f => { this.chartAt = f == null ? null : { key, f }; place(); };
    const aim = e => { const b = svg.getBoundingClientRect(); read(Math.max(0, Math.min(1, ((e.clientX - b.left) * (W / b.width) - L) / (W - L - R)))); };
    const step = by => { const i = Math.max(0, Math.min(pts.length - 1, nearest(at() ?? 1) + by)); read((pts[i].t - first.t) / span); };
    const now = rows[rows.length - 1];
    const plot = h('div', { class: 'fin-plot', tabindex: '0', role: 'group', 'data-key': 'chart-' + key,
      'aria-label': `${title}, last ${ago(span).replace(' ago', '')} of play. ${series.map(([, name], k) => `${name} now ${full(now[k])}`).join(', ')}. The left and right arrow keys read earlier values.`,
      onpointermove: aim, onpointerdown: aim, onpointerleave: () => read(null),
      onfocus: () => { if (at() == null) read(1); },
      onblur: () => { if (plot.isConnected) read(null); },
      onkeydown: e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } } }, svg, tip);
    place();
    // The same numbers as a table, newest first: about one row a minute for ten minutes, one every 15 seconds for two.
    const tables = (this.tables ||= {}), open = !!tables[key], cols = [...series.map(([, name]) => name), ...(profit ? ['Profit'] : [])];
    const toggle = this.button_(open ? 'Hide the table' : 'Show the numbers as a table', 'table-' + key, () => { tables[key] = !tables[key]; this.render(); }, { cls: 'quiet small' });
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const table = open ? h('div', { class: 'fin-panel fin-table' }, h('table', {},
      h('caption', { class: 'hq-sr', text: title }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'When' }), ...cols.map(name => h('th', { scope: 'col', text: name })))),
      h('tbody', {}, ...thin(pts.map((p, i) => i)).reverse().map(i => h('tr', {}, h('th', { scope: 'row', text: ago(last.t - pts[i].t) }),
        ...series.map((line, k) => h('td', {}, amount(Math.round(rows[i][k] * per)))),
        profit ? h('td', {}, amount(Math.round((rows[i][0] - rows[i][1]) * per))) : null))))) : null;
    return h('section', { class: 'fin-section' },
      h('header', { class: 'fin-chart-head' }, h('h3', { text: title }),
        series.length > 1 ? h('div', { class: 'fin-legend' }, ...series.map(([, name, style]) => h('span', {}, h('i', { class: 'fin-key ' + style }), h('span', { text: name })))) : null),
      h('div', { class: 'fin-panel fin-chart' }, plot), toggle, table);
  }

  // --- Market ------------------------------------------------------------------------------
  // What the goods of Commercial Metropolis sell for right now, against their normal price, with the
  // last half hour of prices. Every figure comes from the company (marketReport) and the market itself.
  market() {
    const c = this.company, m = c.market, econ = this.game.econ, log = this.priceLog();
    const band = Math.round(MARKET.band * 100), wait = Math.max(1, Math.ceil(m.nextIn));
    // Metropolis machines get their materials by truck: say so while a route into an open yard is still to buy.
    const routes = c.routeDefs.filter(d => !c.routes[d.id] && c.marketYards.includes(d.to) && econ.areaOpen(d.from) && econ.areaOpen(d.to));
    return [
      note(`Goods made in Commercial Metropolis are sold on its market. A price is never more than ${band}% above or below normal, and it always drifts back toward normal. Contracts and the pay for time away use the normal price.`),
      h('div', { class: 'hq-rows' }, row('New prices', `every ${MARKET.step} seconds of play`), row('Next prices in', `${wait} s`)),
      routes.length ? h('div', { class: 'hq-todo' }, marked('logistics', `Commercial Metropolis needs trucks: ${routes.length} route${routes.length === 1 ? '' : 's'} to buy`), this.button_('Logistics', 'go-logistics', () => this.go('logistics'))) : null,
      ...c.marketReport().map(r => this.marketCard(r, log)),
      note('Keeping a good in the warehouse takes it from the shop until the warehouse is full. Sell it here when the price is good.'),
    ];
  }
  /** One good on the market: price now, normal price, the difference, its history, and what the warehouse holds. */
  marketCard(r, log) {
    const c = this.company, name = cap(label(r.item));
    const tone = Math.abs(r.diff) < 0.0005 ? '' : r.diff > 0 ? 'good' : 'bad';
    const share = `${(Math.abs(r.diff) * 100).toFixed(1)}%`;
    const state = !tone ? chip('At the normal price', '', 'flat') : chip(`${share} ${r.diff > 0 ? 'above' : 'below'} normal`, tone, r.diff > 0 ? 'up' : 'down');
    return h('article', { class: 'hq-card market' },
      h('header', {}, h('h4', { text: name }), state),
      h('div', { class: 'hq-rows' },
        row('Price now', figure(r.price), tone),
        row('Normal price', figure(r.normal)),
        row('Difference', !tone ? 'none' : `${r.diff > 0 ? '+' : '−'}${share}`, tone)),
      this.priceChart(r, log),
      r.made
        ? h('div', { class: 'hq-need' }, h('span', { text: 'In the warehouse' }), bar(r.stock / c.capacity), h('b', { text: `${r.stock} / ${c.capacity}` }))
        : h('div', { class: 'hq-sub', text: `You do not make ${label(r.item)} yet. They come from the ${yardName(r.yard)}.` }),
      r.made ? h('div', { class: 'hq-actions' },
        this.button_(r.free > 0 ? `Sell ${r.free} for ${money(r.free * r.price)}` : 'Nothing to sell', 'sell-' + r.item, () => this.act('sell', () => c.sellStock(r.item)), { cls: 'primary', disabled: r.free <= 0, exact: r.free * r.price }),
        this.button_(`Keep in the warehouse: ${r.holding ? 'On' : 'Off'}`, 'hold-' + r.item, () => this.act('toggle', () => c.setHold(r.item, !r.holding)), { cls: r.holding ? '' : 'quiet' })) : null);
  }
  /**
   * The prices behind the charts: one sample per price step, kept in a Series like the Finance chart's.
   * It is filled from the market's own record, which gives the same prices for the same seed and time,
   * so the history is complete after a reload and nothing has to be sampled while the screen is closed.
   */
  priceLog() {
    const m = this.company.market;
    if (!this.prices || this.prices.seed !== m.seed || m.step < this.prices.step || m.step - this.prices.step > MARKET.history) {
      this.prices = { seed: m.seed, step: Math.max(-1, m.step - MARKET.history), series: new Series({ every: MARKET.step, keep: MARKET.history }) };
    }
    const p = this.prices;
    while (p.step < m.step) { const step = ++p.step; p.series.add(MARKET.step, () => m.factorsAt(step)); }
    return p.series;
  }
  /** The price of one good over the last half hour of play, on an axis that is the whole band: one line, read with a crosshair. */
  priceChart(r, log) {
    const pts = log.points, item = r.item, name = label(item), band = MARKET.band;
    if (pts.length < 2) return h('div', { class: 'fin-chart' }, h('p', { class: 'fin-empty', text: `The market has just opened. The price history of ${name} starts with the next prices.` }));
    const W = Math.max(220, Math.round(this.body.clientWidth - 86)), H = 108, L = 46, R = 6, T = 8, B = 22;   // the left margin holds the axis figures
    const first = pts[0], last = pts[pts.length - 1], span = last.t - first.t;
    const x = t => L + (t - first.t) / span * (W - L - R), y = f => T + (1 + band - f) / (2 * band) * (H - B - T);
    const fix = n => Math.round(n * 10) / 10;
    const svg = s('svg', { class: 'fin-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H },
      [1 + band, 1, 1 - band].map(f => s('line', { class: 'fin-grid' + (f === 1 ? ' base' : ''), x1: L, x2: W - R, y1: fix(y(f)), y2: fix(y(f)) })),
      [1 + band, 1, 1 - band].map(f => s('text', { class: 'fin-axis', x: L - 8, y: fix(y(f) + 4), 'text-anchor': 'end', text: money(r.normal * f) }, isShortened(r.normal * f) ? s('title', { text: exactMoney(r.normal * f) }) : null)),
      s('text', { class: 'fin-axis', x: L, y: H - 6, text: ago(span) }),
      s('text', { class: 'fin-axis', x: W - R, y: H - 6, 'text-anchor': 'end', text: 'now' }),
      s('polyline', { class: 'fin-line income', points: pts.map(p => `${fix(x(p.t))},${fix(y(p[item]))}`).join(' ') }),
      s('circle', { class: 'fin-end income', cx: fix(x(last.t)), cy: fix(y(last[item])), r: 3.5 }));
    const cross = s('line', { class: 'fin-cross', y1: T, y2: H - B }), dot = s('circle', { class: 'fin-end income', r: 3.5 });
    svg.append(cross, dot);
    const tip = h('div', { class: 'fin-tip' });
    const signed = f => (Math.abs(f - 1) < 0.0005 ? 'normal' : `${f > 1 ? '+' : '−'}${(Math.abs(f - 1) * 100).toFixed(1)}%`);
    const nearest = f => { const at = first.t + f * span; return pts.reduce((b, p, i) => (Math.abs(p.t - at) < Math.abs(pts[b].t - at) ? i : b), 0); };
    // Where a price chart is being read: { item, at } with at from 0 (oldest) to 1 (now). One chart at a time, kept across redraws.
    const at = () => (this.priceAt?.item === item ? this.priceAt.at : null);
    const place = () => {
      const on = at() != null;
      for (const el of [cross, dot]) el.style.display = on ? '' : 'none';
      tip.hidden = !on;
      if (!on) return;
      const p = pts[nearest(at())], px = fix(x(p.t));
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      dot.setAttribute('cx', px); dot.setAttribute('cy', fix(y(p[item])));
      tip.replaceChildren(h('div', { class: 'fin-tip-time', text: ago(last.t - p.t) }),
        h('div', { class: 'fin-tip-row' }, h('i', { class: 'fin-key income' }), h('b', {}, amount(r.normal * p[item])), h('span', { text: signed(p[item]) })));
      const leftSide = px > W / 2;   // keep the readout inside the chart
      tip.style.left = leftSide ? '' : (px + 10) + 'px';
      tip.style.right = leftSide ? (W - px + 10) + 'px' : '';
    };
    const aim = e => { const b = svg.getBoundingClientRect(); this.priceAt = { item, at: Math.max(0, Math.min(1, ((e.clientX - b.left) * (W / b.width) - L) / (W - L - R))) }; place(); };
    const step = by => { const i = Math.max(0, Math.min(pts.length - 1, nearest(at() ?? 1) + by)); this.priceAt = { item, at: (pts[i].t - first.t) / span }; place(); };
    const low = Math.min(...pts.map(p => p[item])), high = Math.max(...pts.map(p => p[item]));
    const plot = h('div', { class: 'fin-plot', tabindex: '0', role: 'group', 'data-key': 'price-chart-' + item,
      'aria-label': `Price of ${name}, last ${ago(span).replace(' ago', '')} of play. Now ${exactMoney(r.price)}, normal ${exactMoney(r.normal)}, lowest ${exactMoney(r.normal * low)}, highest ${exactMoney(r.normal * high)}. The left and right arrow keys read earlier prices.`,
      onpointermove: aim, onpointerdown: aim, onpointerleave: () => { if (at() != null) { this.priceAt = null; place(); } },
      onfocus: () => { if (at() == null) { this.priceAt = { item, at: 1 }; place(); } },
      onblur: () => { if (plot.isConnected && at() != null) { this.priceAt = null; place(); } },
      onkeydown: e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } } }, svg, tip);
    place();
    return h('div', { class: 'fin-chart' }, plot);
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

  // ==================================================================================================
  // More to do: the streak and the swap on the Goals tab, the Records tab, the Advisor tab, the
  // company's name and the backup. Everything below reads the company's own state and calls its rules.
  // ==================================================================================================

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

  // --- Records ------------------------------------------------------------------------------------------
  records() {
    const c = this.company, b = c.recordBook();
    const hours = sec => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.floor(sec % 3600 / 60)} min` : `${Math.floor(sec / 60)} min`);
    const goods = b.goods.slice(0, 8).map(g => h('div', { class: 'fin-row share' },
      h('span', { class: 'fin-name', text: cap(label(g.item)) }), h('span', { class: 'fin-share' }, h('i', { width: g.share })),
      h('span', { class: 'fin-pct', text: Math.round(g.share * 100) + '%' }), figure(fmt(g.count))));
    const clients = c.clientList().slice(0, 10).map(x => row(x.name,
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
      section('Backup', this.backupCard()),
    ];
  }

  // --- the company's name ---------------------------------------------------------------------------------
  /** Put the company's name where the screen says "Business Headquarters". Called when the game starts and after a rename. */
  showName() {
    const el = this.el.querySelector?.('.hq-kicker');
    if (el) el.textContent = this.company.name || 'Business Headquarters';
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

  // --- the backup -----------------------------------------------------------------------------------------
  // this.backup is what the last export or import said: { text, tone }, and for a file that was read and
  // checked also { save, summary }. Nothing is replaced until the player has pressed twice.
  backupCard() {
    const b = this.backup, arm = this.confirm === 'restore';
    const when = ms => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'an unknown date');
    return h('article', { class: 'hq-card backup' },
      h('header', {}, h('h4', {}, icon('collect'), h('span', { text: 'A backup you can hold' }))),
      h('div', { class: 'hq-sub', text: 'Save your game as a file and keep it. Opening a backup replaces the game you are playing now with the one in the file, on this or another device.' }),
      h('div', { class: 'hq-actions' },
        this.button_('Save a backup file', 'backup-save', () => this.exportBackup()),
        this.button_('Open a backup file', 'backup-open', () => this.pickBackup())),
      b?.text ? h('div', { class: 'hq-sub ' + (b.tone || ''), role: 'status', text: b.text }) : null,
      b?.save ? h('div', { class: 'hq-rows' },
        row('Made on', when(b.summary.exported)),
        b.summary.name ? row('Company', b.summary.name) : null,
        row('Rank', b.summary.rank),
        row('Yards open', String(b.summary.yards)),
        row('Cash', amount(b.summary.cash)),
        b.summary.stars ? row('Legacy stars', String(b.summary.stars)) : null) : null,
      b?.save ? h('div', { class: 'hq-actions' },
        this.button_(arm ? 'Tap again to replace your game' : 'Replace my game with this backup', 'backup-restore',
          () => { if (!arm) { this.confirm = 'restore'; this.render(); return; } this.game.restore(b.save); }, { cls: arm ? 'danger' : 'primary' }),
        this.button_('Forget it', 'backup-forget', () => { this.backup = null; this.confirm = null; this.render(); }, { cls: 'quiet' })) : null);
  }
  async exportBackup() {
    this.game.save();   // the file holds the game as it is this second
    const now = new Date(), name = backupName(now);
    const text = exportSave(JSON.parse(JSON.stringify(this.game.econ)), now.getTime());
    const how = await saveFile(name, text, 'text/plain');   // a download in a browser, the share sheet in the app
    this.backup = how === 'saved' ? { text: `Saved as ${name}. Keep the file somewhere safe.`, tone: 'good' }
      : how === 'shared' ? { text: `${name} is ready. Keep it somewhere safe.`, tone: 'good' }
        : how === 'cancelled' ? { text: 'No backup was made.', tone: '' }
          : { text: 'The backup file could not be made on this device.', tone: 'bad' };
    this.confirm = null; this.render();
  }
  /** Let the player choose a file. The field that does it is made once and kept beside the tabs, out of the way of redraws. */
  pickBackup() {
    if (!this.filePicker) {
      this.filePicker = h('input', { type: 'file', accept: '.txt,text/plain,application/json', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
      this.filePicker.addEventListener('change', async () => {
        const file = this.filePicker.files?.[0];
        this.filePicker.value = '';   // so that choosing the same file again is noticed
        if (!file) return;
        let text = '';
        try { text = file.size > 4000000 ? 'x'.repeat(2000001) : await file.text(); } catch { text = ''; }   // a file that large is refused by its size alone
        this.readBackup(text);
      });
      this.el.append(this.filePicker);
    }
    this.filePicker.click();
  }
  /** Check the text of a backup file. A good one is shown with what it holds; a bad one with the reason it is refused. */
  readBackup(text) {
    const r = importSave(text, Date.now());
    this.backup = r.ok ? { save: r.save, summary: r.summary, text: 'This backup is whole and can be brought back.', tone: 'good' } : { text: r.reason, tone: 'bad' };
    this.confirm = null;
    if (this.isOpen) this.render();
  }

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
