// DOM HUD: the top bar (cash and income, yard chip, save status, log), the objective card, the unlock
// card, the sheets (settings, yards, log, shortcuts, welcome back), a line of help, the loading screen.
import { fmt } from './format.js';
import { icon } from './icons.js';
import { loading } from './loading.js';
import { Journal, ago, rateText, awayFacts, SHORTCUTS } from './ui-logic.js';

// The icon of a card, by the small heading above its title, when the card does not name one itself.
const KICKER_ICON = { Unlocked: 'upgrade', 'New area': 'expansion', New: 'businesses', Milestone: 'award', Promoted: 'star', Contract: 'contracts',
  Achievement: 'award', Goal: 'goals', Tycoon: 'ranking', 'A new start': 'star', Event: 'star', 'Tutorial done': 'check' };
const CARD_MS = 3100, CARD_MS_BUSY = 2000;   // how long an unlock card stays; shorter while several more are waiting

const $ = id => document.getElementById(id);
/** An element with a class and, when given, text. Everything the HUD builds goes through here: no markup is parsed. */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export class Hud {
  constructor() {
    this.cashEl = $('cash'); this.cashValue = $('cash-value');
    this.shown = 0; this.target = 0; this.lastText = '';
    this.objKey = '';
    this.unlockQueue = []; this.unlockBusy = false; this.unlockTimer = 0;
    this.journal = new Journal(30);
    const showVersion = () => {
      const v = window.yardEmpireVersion, el = $('game-version');
      if (!el || !v?.commit) return;
      el.textContent = `Version ${v.commit}${v.date ? ' · ' + String(v.date).slice(0, 10) : ''}`; el.hidden = false;
    };
    // The page learns its version a moment after it starts, and says so (js/pwa.js). On a slow phone that moment
    // can be long: waiting a fixed time left the line empty there.
    showVersion(); addEventListener('yard:version', showVersion);
    this.sheets = [];          // the open sheets, the one on top last
    this.onSheets = null;      // (open: boolean) the first sheet opened, or the last one closed
    this.onShowWay = null; this.onYardChip = null; this.onBare = null;
    this.start = null;         // what the loading screen should do when the game is ready (see hideLoading)
    this.rateKey = ''; this.saveKey = ''; this.areaKey = ''; this.hintTimer = 0; this.standing = '';
    $('off-icon').replaceChildren(icon('team'));
    $('log-icon').replaceChildren(icon('bell'));
    $('unlock').addEventListener('click', () => { if (this.unlockBusy) this.nextUnlock(); });
    $('obj-show').addEventListener('click', () => this.onShowWay?.());
    $('area-chip').addEventListener('click', () => this.onYardChip?.());
    $('log-btn').addEventListener('click', () => this.showLog());
    for (const id of ['yards', 'log', 'keys']) {
      const sheet = $(id);
      $(id + '-close').addEventListener('click', () => this.closeSheet(sheet));
      sheet.addEventListener('click', e => { if (e.target === sheet) this.closeSheet(sheet); });
    }
    this.watchTopBar();
  }

  /** The unlock card sits just under the top bar, whatever its height is on this screen and at this text size. */
  watchTopBar() {
    const bar = $('topbar'), root = document.documentElement;
    const measure = () => root.style.setProperty('--top-h', Math.ceil(bar.getBoundingClientRect().bottom) + 'px');
    if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(bar);
    else addEventListener('resize', measure);
    measure();
  }

  // --- cash ---------------------------------------------------------------
  setCash(v, instant = false) {
    this.target = v;
    if (instant) { this.shown = v; this.renderCash(); }
  }
  bumpCash() {
    this.cashEl.classList.remove('bump'); void this.cashEl.offsetWidth; this.cashEl.classList.add('bump');
  }
  renderCash() {
    const t = fmt(this.shown);
    if (t !== this.lastText) { this.cashValue.textContent = t; this.lastText = t; }
  }
  tick(dt) {
    const d = this.target - this.shown;
    if (d === 0) return;
    this.shown = Math.abs(d) < 1 ? this.target : this.shown + d * Math.min(1, dt * 10);
    this.renderCash();
  }
  /** What the company makes a minute, under the cash. @param perSecond  null before the company is founded */
  setRate(perSecond) {
    const r = perSecond == null ? null : rateText(perSecond), key = r ? r.text + r.tone : '';
    if (key === this.rateKey) return;
    this.rateKey = key;
    const out = $('cash-rate');
    out.hidden = !r;
    if (!r) return;
    out.textContent = r.text;
    out.className = r.tone;
  }

  // --- area chip ----------------------------------------------------------
  setArea(name, index, total) {
    const key = name + index + '/' + total;
    if (key === this.areaKey) return;
    this.areaKey = key;
    $('area-name').textContent = name;
    $('area-count').textContent = index + '/' + total;
    $('area-chip').setAttribute('aria-label', `${name}, yard ${index} of ${total}. Go to a yard`);
  }

  // --- save status ----------------------------------------------------------
  /** @param s  what ui-logic's saveStatus returns */
  setSave(s) {
    if (s.key === this.saveKey) return;
    this.saveKey = s.key;
    const box = $('save-status');
    box.hidden = false;
    box.className = 'status ' + s.key;
    box.title = s.long;
    $('save-icon').replaceChildren(icon(s.icon));
    $('save-text').textContent = s.short;
    $('save-note').textContent = s.long;
  }

  // --- a line of help above the objective card --------------------------------
  /** @param ms  how long it stays; 0 keeps it until hideHint, and it comes back after a shorter one has had its say */
  hint(text, ms = 0) {
    const box = $('hint');
    clearTimeout(this.hintTimer);
    if (ms <= 0) this.standing = text;
    box.textContent = text; box.hidden = false;
    if (ms > 0) this.hintTimer = setTimeout(() => (this.standing ? this.hint(this.standing) : this.hideHint()), ms);
  }
  hideHint() { clearTimeout(this.hintTimer); this.standing = ''; $('hint').hidden = true; }

  // --- objective card -----------------------------------------------------
  /** @param o {{ symbol, text, step?, sub?, progress?, tutorial? }}  symbol: the name of an icon in js/icons.js */
  setObjective(o) {
    const key = [o.symbol, o.text, o.step, o.sub, o.progress == null ? '' : o.progress.toFixed(3), o.tutorial].join('|');
    if (key === this.objKey) return;
    this.objKey = key;
    $('obj-icon').replaceChildren(icon(o.symbol || 'goals'));
    $('obj-text').textContent = o.text;
    $('obj-step').textContent = o.step || '';
    $('obj-show').setAttribute('aria-label', o.text + '. Show the way');
    $('objective').classList.toggle('tutorial', !!o.tutorial);
    const prog = document.querySelector('.o-progress');
    prog.classList.toggle('hidden', o.progress == null);
    if (o.progress != null) {
      $('obj-fill').style.width = Math.round(Math.max(0, Math.min(1, o.progress)) * 100) + '%';
      $('obj-sub').textContent = o.sub || '';
    }
  }

  // --- unlock card (queued so two unlocks never overlap) -------------------
  /** Announce something. It is shown as a card, which a tap sends away, and kept in the log behind the bell. */
  unlock(card) {
    const symbol = card.symbol || KICKER_ICON[card.kicker] || 'award';
    this.journal.add({ kicker: card.kicker || 'Unlocked', title: card.title, desc: card.desc || '', symbol }, Date.now());
    $('log-dot').hidden = false;
    this.unlockQueue.push({ ...card, symbol });
    if (!this.unlockBusy) this.nextUnlock(); else this.showWaiting();
  }
  nextUnlock() {
    clearTimeout(this.unlockTimer);
    const card = this.unlockQueue.shift(), box = $('unlock');
    if (!card) { this.unlockBusy = false; box.classList.remove('show'); return; }
    this.unlockBusy = true;
    document.querySelector('#unlock .u-kicker').textContent = card.kicker || 'Unlocked';
    $('unlock-icon').replaceChildren(icon(card.symbol)); $('unlock-title').textContent = card.title; $('unlock-desc').textContent = card.desc || '';
    this.showWaiting();
    box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
    this.unlockTimer = setTimeout(() => this.nextUnlock(), this.unlockQueue.length > 2 ? CARD_MS_BUSY : CARD_MS);
  }
  showWaiting() {
    const n = this.unlockQueue.length, more = $('unlock-more');
    more.hidden = n === 0;
    more.textContent = n ? `+${n} more` : '';
  }

  // --- sheets ----------------------------------------------------------------
  /** Open a sheet over the yard. The game pauses while any is open; focus moves into it and comes back when it closes. */
  openSheet(sheet, focus) {
    if (!sheet.hidden) return;
    this.sheets.push({ sheet, back: document.activeElement });
    sheet.hidden = false;
    if (this.sheets.length === 1) this.onSheets?.(true);
    (focus || sheet.querySelector('.sheet-btn.primary'))?.focus({ preventScroll: true });
  }
  closeSheet(sheet) {
    const i = this.sheets.findIndex(s => s.sheet === sheet);
    if (i < 0) return false;
    const [s] = this.sheets.splice(i, 1);
    sheet.hidden = true;
    sheet.onclosed?.();
    if (!this.sheets.length) this.onSheets?.(false);
    if (s.back instanceof HTMLElement && s.back.isConnected) s.back.focus({ preventScroll: true });
    return true;
  }
  /** Close the sheet on top, for the Escape key. @returns false when none was open */
  closeTop() { const top = this.sheets[this.sheets.length - 1]; return top ? this.closeSheet(top.sheet) : false; }
  get sheetOpen() { return this.sheets.length > 0; }

  // --- settings -----------------------------------------------------------
  bindSettings({ settings, onReset, onReplayTutorial, onOpen, onClose, onToggle }) {
    const sheet = $('settings'), reset = $('btn-reset'), fs = $('btn-fullscreen');
    this.onSheets = open => (open ? onOpen?.() : onClose?.());
    const renders = [];
    const bindToggle = (id, name, label) => {
      const b = $(id);
      renders.push(() => { b.textContent = `${label}: ${settings[name] ? 'On' : 'Off'}`; b.classList.toggle('off', !settings[name]); });
      b.addEventListener('click', () => { settings.toggle(name); onToggle?.(name); });
    };
    // A switch and a slider for each: the name mutes and unmutes, the slider sets how loud, and zero is off.
    const bindVolume = name => {
      const b = $('btn-' + name), range = $('vol-' + name), out = $(`vol-${name}-val`);
      renders.push(() => {
        const pct = Math.round(settings.level(name) * 100);
        if (Number(range.value) !== pct) range.value = String(pct);
        range.style.setProperty('--fill', pct + '%');
        out.textContent = pct ? pct + '%' : 'Off';
        b.setAttribute('aria-pressed', String(pct > 0)); b.classList.toggle('off', !pct);
      });
      b.addEventListener('click', () => { settings.toggle(name); onToggle?.(name); });
      range.addEventListener('input', () => settings.setVolume(name, Number(range.value) / 100));
      range.addEventListener('change', () => onToggle?.(name));   // one click on letting go, to hear the new volume
    };
    bindVolume('sound'); bindVolume('music');
    bindToggle('btn-haptics', 'haptics', 'Vibration');
    bindToggle('btn-text', 'largeText', 'Larger text');
    const motion = $('btn-motion');
    renders.push(() => {
      // When the device itself asks for less motion the game follows, and the switch has nothing left to decide.
      const forced = settings.systemCalm && !settings.reduceMotion;
      motion.textContent = forced ? 'Reduce motion: On, as your device asks' : `Reduce motion: ${settings.reduceMotion ? 'On' : 'Off'}`;
      motion.classList.toggle('off', !settings.calm); motion.disabled = forced;
    });
    motion.addEventListener('click', () => { settings.toggle('reduceMotion'); onToggle?.('reduceMotion'); });
    const gfx = $('btn-graphics');
    renders.push(() => { gfx.textContent = 'Graphics: ' + { auto: 'Auto', high: 'High', low: 'Low' }[settings.graphics]; });
    gfx.addEventListener('click', () => { settings.nextGraphics(); onToggle?.('graphics'); });
    const render = () => { for (const r of renders) r(); };
    settings.onChange(render);   // the mute key and the system's motion setting change these from outside the sheet
    render();
    if (!navigator.vibrate) $('btn-haptics').hidden = true;

    const close = () => this.closeSheet(sheet);
    sheet.onclosed = () => { reset.classList.remove('confirm'); reset.textContent = 'Reset progress'; };
    $('settings-btn').addEventListener('click', () => this.openSheet(sheet, $('btn-close')));
    $('btn-close').addEventListener('click', close);
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
    reset.addEventListener('click', () => {
      if (!reset.classList.contains('confirm')) { reset.classList.add('confirm'); reset.textContent = 'Tap again to erase everything'; return; }
      onReset();
    });
    $('btn-tutorial').addEventListener('click', () => { onReplayTutorial(); close(); });
    $('btn-keys').addEventListener('click', () => { close(); this.showKeys(); });
    $('btn-bare').addEventListener('click', () => { close(); this.onBare?.(); });
    const root = document.documentElement;
    if (!root.requestFullscreen) fs.hidden = true;
    fs.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen().catch(() => {});
      close();
    });
    $('skip-tutorial').addEventListener('click', () => this.onSkipTutorial?.());
  }

  // --- the yard list ----------------------------------------------------------
  /**
   * @param yards {{ id, name, place, index, here }[]}  the open yards, in order; place: the town or city a yard is in
   * @param onPick  called with the id of the chosen yard, after the sheet has closed
   */
  showYards(yards, onPick) {
    const sheet = $('yards'), list = $('yards-list');
    const rows = yards.map(y => {
      const row = el('button', 'row' + (y.here ? ' here' : ''));
      row.type = 'button';
      if (y.here) row.setAttribute('aria-current', 'location');
      const body = el('span', 'r-body');
      body.append(el('span', 'r-title', y.name), el('span', 'r-sub', y.place));
      row.append(el('span', 'r-num', String(y.index)), body);
      if (y.here) row.append(el('span', 'r-tag', 'You are here'));
      row.addEventListener('click', () => { this.closeSheet(sheet); if (!y.here) onPick(y.id); });
      return row;
    });
    if (yards.length < 2) rows.push(el('div', 'sheet-note', 'The yards you open are listed here, to go to any of them at once.'));
    list.replaceChildren(...rows);
    this.openSheet(sheet, list.querySelector('.here'));
  }

  // --- the log ----------------------------------------------------------------
  showLog() {
    const sheet = $('log'), list = $('log-list');
    const times = [];
    const rows = this.journal.items.map(e => {
      const row = el('div', 'row'), body = el('span', 'r-body'), when = el('span', 'r-when');
      const tile = el('span', 'r-icon'); tile.append(icon(e.symbol));
      const kicker = el('span', 'r-kicker', e.kicker + ' · '); kicker.append(when);
      body.append(kicker, el('span', 'r-title', e.title));
      if (e.desc) body.append(el('span', 'r-sub', e.desc));
      row.append(tile, body);
      times.push([when, e.at]);
      return row;
    });
    if (!rows.length) rows.push(el('div', 'sheet-note', 'Nothing yet. What you unlock and reach is listed here until you close the game.'));
    list.replaceChildren(...rows);
    const tell = () => { const now = Date.now(); for (const [when, at] of times) when.textContent = ago((now - at) / 1000); };
    tell();
    const timer = setInterval(tell, 20000);   // an open log keeps its times true
    sheet.onclosed = () => clearInterval(timer);
    this.journal.seen();
    $('log-dot').hidden = true;
    this.openSheet(sheet);
  }

  // --- keyboard shortcuts ------------------------------------------------------
  showKeys() {
    const sheet = $('keys');
    $('keys-list').replaceChildren(...SHORTCUTS.map(s => {
      const row = el('div', 'k-row'), keys = el('dt');
      for (const k of s.keys) keys.append(el('kbd', '', k));
      if (s.also) keys.append(el('span', 'k-also', s.also));
      row.append(keys, el('dd', '', s.does));
      return row;
    }));
    this.openSheet(sheet);
  }

  // --- welcome back card ----------------------------------------------------
  /**
   * @param o {{ earned, seconds, capped, away, share, afterCosts, left, allowance }}  the pay and its terms, in dollars and seconds
   */
  showOffline(o, onCollect) {
    const sheet = $('offline'), btn = $('off-collect'), facts = awayFacts(o);
    $('off-amount').textContent = '$' + fmt(o.earned);
    $('off-away').textContent = facts.away;
    $('off-time').textContent = facts.paid;
    $('off-share').textContent = facts.rate;
    $('off-left').textContent = facts.left;
    sheet.hidden = false;
    btn.focus({ preventScroll: true });
    btn.onclick = () => { sheet.hidden = true; btn.onclick = null; onCollect(); };
  }

  /** The game is ready: the loading screen leaves, or turns into the start screen on a first visit. */
  hideLoading() { loading.finish(this.start || {}); }
}
