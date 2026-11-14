// The small pieces every tab of the Headquarters is built from: the element makers h() and s(), money and
// time formatting, figures that carry their exact number, chips, rows, notes and sections, and mix(), which
// lets each tab's file add its methods to the Headquarters class.
import { fmt } from '../format.js';
import { AREAS, ITEMS } from '../data/areas.js';
import { icon } from '../icons.js';
import { exactMoney, isShortened } from '../sim/hqview.js';

export const HISTORY = { every: 5, keep: 120, warmup: 45 };   // the Finance chart: a sample every 5 s, ten minutes kept, none while the figures settle
export const SVG = 'http://www.w3.org/2000/svg';
export const RANKING = { every: 30000, wait: 5000 };     // the list refreshes by itself this often while watched; the button rests this long after a load

/**
 * Copy the methods of each part class onto the prototype of `target`, so a tab can live in its own file and still
 * be a method of the one Headquarters (`this` is the Headquarters in all of them).
 */
export function mix(target, ...parts) {
  for (const part of parts) {
    for (const key of Object.getOwnPropertyNames(part.prototype)) {
      if (key !== 'constructor') Object.defineProperty(target.prototype, key, Object.getOwnPropertyDescriptor(part.prototype, key));
    }
  }
}

/** h('div', { class: 'x', text: 'hi', onclick }, child, ...). Text only: nothing here is parsed as HTML. */
export function h(tag, props = {}, ...kids) {
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
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); }
  for (const kid of kids.flat()) if (kid) el.append(kid);
  return el;
}
/** What a place on the screen says while it has nothing to show: what will appear there and, where there is one, a button that leads to it. */
export const empty = (text, action) => h('div', { class: 'hq-empty' }, h('p', { text }), action);
export const money = n => (n < 0 ? '−$' + fmt(-n) : '$' + fmt(n));
export const minute = perSec => money(Math.round(perSec * 60));   // a rate per second, as dollars a minute without the unit
export const aMinute = perSec => Math.round(perSec * 60);         // the same as a number, for figure() and amount()
/**
 * The one place a shortened money figure ($5.2M) gets its exact number: as a title for the mouse, and as
 * hidden text that a screen reader gets in place of the short form. Below $10,000 the figure shown is
 * exact already and stays plain text. The first child is always the figure itself: the stylesheet colours it.
 */
export function exact(n, cls, unit) {
  const short = h('span', { text: money(n) }), tail = unit && h('span', { class: 'fin-unit', text: unit });
  if (!isShortened(n)) return h('span', { class: cls }, short, tail);
  const full = exactMoney(n) + (unit === '/min' ? ' a minute' : unit ? ' ' + unit : '');
  short.setAttribute('aria-hidden', 'true');
  if (tail) tail.setAttribute('aria-hidden', 'true');
  return h('span', { class: cls, title: full }, short, tail, h('span', { class: 'hq-sr', text: full }));
}
/** The same for an element whose own text holds the figure, a button mostly: the exact number as its title and in its label. */
export function exactOn(el, text, n) {
  if (!isShortened(n)) return el;
  el.setAttribute('title', exactMoney(n));
  el.setAttribute('aria-label', text.replace(money(n), exactMoney(n)));
  return el;
}
/** A money amount inside a sentence, a row or a cell. */
export const amount = (n, cls = '') => exact(n, ('hq-amt ' + cls).trim());
/** A sentence that has the figure for `n` in it, as text and elements, so that the figure carries its exact number. */
export const withAmount = (text, n) => {
  const short = money(n), i = isShortened(n) ? text.indexOf(short) : -1;
  return i < 0 ? [text] : [text.slice(0, i), amount(n), text.slice(i + short.length)].filter(Boolean);
};
/** "3 of 10" under a progress bar; with money, both figures carry their exact number. */
export const ofLine = (value, target, isMoney) => h('div', { class: 'hq-sub' }, ...(isMoney ? [amount(value), ' of ', amount(target)] : [`${fmt(value)} of ${fmt(target)}`]));
/** A figure with its unit as a separate, smaller piece: $5.2M /min. A number is money and gets its exact figure; text is shown as it is. */
export const figure = (value, unit) => (typeof value === 'number' ? exact(value, 'fin-figure', unit)
  : h('span', { class: 'fin-figure' }, h('span', { text: value }), unit && h('span', { class: 'fin-unit', text: unit })));
export const ago = sec => (sec < 3 ? 'now' : sec < 60 ? `${Math.round(sec)} s ago` : `${Math.floor(sec / 60)} min${Math.round(sec % 60) ? ` ${Math.round(sec % 60)} s` : ''} ago`);
export const perMin = n => money(Math.round(n * 60)) + '/min';
export const bar = (value, cls = '') => h('div', { class: 'bar ' + cls }, h('div', { class: 'fill', width: value }));
export const label = item => ITEMS[item].label;
export const needText = ([item, qty]) => `${qty} ${label(item)}`;
export const yardName = id => AREAS.find(a => a.id === id).name;
export const cap = text => text[0].toUpperCase() + text.slice(1);
/** A rate per second as a figure per minute: $5.2M /min. */
export const rate = perSec => figure(aMinute(perSec), '/min');
/** One headline number: its name, the figure, and an optional line under it. tone: up, down or gold. */
export const kpi = (name, value, unit, under, tone = '') => h('div', { class: 'fin-kpi ' + tone },
  h('div', { class: 'fin-label', text: name }), h('div', { class: 'fin-value' }, figure(value, unit)), under);
export const sub = (...kids) => h('div', { class: 'fin-trend' }, ...kids);
/** A small label; mark is the name of an icon to put in front (check, lock). */
export const chip = (text, tone = '', mark) => h('span', { class: 'hq-chip ' + tone }, mark && icon(mark), h('span', { text }));
export const marked = (name, text) => h('span', { class: 'hq-marked' }, icon(name), h('span', { text }));
// Which icon stands for what is counted: milestones by measure, goals by kind.
export const MEASURE_ICON = { yards: 'businesses', workers: 'team', income: 'coin', contracts: 'contracts', research: 'research', routes: 'logistics',
  market: 'market', goodPrice: 'market', sold: 'store', peak: 'coin', rush: 'clock' };
export const KIND_ICON = { income: 'coin', sold: 'store', contracts: 'contracts', upgrades: 'upgrade', trucked: 'logistics', research: 'research' };
export const section = (title, ...kids) => h('section', { class: 'hq-section' }, h('h3', { text: title }), ...kids);
/**
 * What something pays, as one row of chips in one order everywhere: cash, then how much over selling, then XP
 * (rank progress), then reputation. A part that is not given is left out.
 */
export const rewardChips = ({ cash = null, over = null, xp = null, rep = null }) => h('div', { class: 'hq-rchips' },
  cash == null ? null : h('span', { class: 'hq-rchip cash' }, amount(cash)),
  over == null ? null : h('span', { class: 'hq-rchip', text: `+${over}% over selling` }),
  xp == null ? null : h('span', { class: 'hq-rchip xp', text: `+${xp} XP` }),
  rep == null ? null : h('span', { class: 'hq-rchip rep', text: `+${rep} reputation` }));
export const note = (...parts) => h('p', { class: 'hq-note' }, ...parts);   // text, or text and figures in order
export const row = (name, value, cls = '') => h('div', { class: 'hq-row ' + cls }, h('span', { text: name }), h('b', {}, value));   // value: text or a figure
