// DOM HUD: the top bar (cash and income, yard chip, save status, log), the objective card, the unlock
// card, the sheets (settings, yards, log, shortcuts, welcome back), a line of help, the loading screen.
import { fmt } from './format.js';
import { icon } from './icons.js';
import { loading } from './loading.js';
import { Journal, ago, rateText, cashFacts, awayFacts, SHORTCUTS, logTarget, backupLine } from './ui-logic.js';
import { importSave } from './sim/backup.js';
import { GRAPHICS, GRAPHICS_LABEL } from './settings-logic.js';

// The icon of a card, by the small heading above its title, when the card does not name one itself.
const KICKER_ICON = { Unlocked: 'upgrade', 'New area': 'expansion', New: 'hq', Milestone: 'award', Promoted: 'star', Contract: 'contracts',
  Achievement: 'award', Goal: 'goals', Tycoon: 'ranking', 'A new start': 'star', Event: 'clock', 'Tutorial done': 'check', Credits: 'gem' };   // star: rank and legacy stars only; an event lasts until midnight: a clock
const CARD_MS = 3100, CARD_MS_BUSY = 2000;   // how long an unlock card stays; shorter while several more are waiting
const CARD_MS_ACT = 5000;                     // a card with a button stays longer: there is something to press

const $ = id => document.getElementById(id);
/** An element with a class and, when given, text. Everything the HUD builds goes through here: no markup is parsed. */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export class Hud {
  /** @param o {{ logKey?: string }}  logKey: where on the device the log is kept between visits; without one it lasts until the page is closed */
  constructor({ logKey = '' } = {}) {
    this.cashEl = $('cash'); this.cashValue = $('cash-value');
    this.shown = 0; this.target = 0; this.lastText = '';
    this.objKey = '';
    this.unlockQueue = []; this.unlockBusy = false; this.unlockTimer = 0;
    this.journal = new Journal(30);
    this.logKey = logKey;
    if (logKey) try { this.journal.load(JSON.parse(localStorage.getItem(logKey))); } catch { /* nothing kept, or nothing readable: an empty log */ }
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
    this.onShowWay = null; this.onYardChip = null; this.onBare = null; this.onMotivation = null;
    this.start = null;         // what the loading screen should do when the game is ready (see hideLoading)
    this.rateKey = ''; this.saveKey = ''; this.areaKey = ''; this.hintTimer = 0; this.standing = '';
    $('off-icon').replaceChildren(icon('team'));
    $('log-icon').replaceChildren(icon('bell'));
    $('unlock').addEventListener('click', () => { if (this.unlockBusy) this.nextUnlock(); });
    // A card's one button ("Open the park") does what it says, and the card makes way for the next.
    $('unlock-act')?.addEventListener('click', e => { e.stopPropagation(); const card = this.unlockNow; this.nextUnlock(); card?.onAction?.(); });
    this.motivationChip = $('motivation-chip'); this.motivationKey = '';
    this.motivationChip?.addEventListener('click', () => this.onMotivation?.());
    $('obj-show').addEventListener('click', () => this.onShowWay?.());
    $('area-chip').addEventListener('click', () => this.onYardChip?.());
    $('log-btn').addEventListener('click', () => this.showLog());
    this.onCash = null;   // () => { summary, finance }: what the company makes, and whether its Finance tab is open to the player
    this.onFinance = null;
    this.cashEl.addEventListener('click', () => this.showCash());
    $('money-finance').addEventListener('click', () => { this.closeSheet($('money')); this.onFinance?.(); });
    for (const id of ['yards', 'log', 'keys', 'store', 'money']) {
      const sheet = $(id);
      $(id + '-close').addEventListener('click', () => this.closeSheet(sheet));
      sheet.addEventListener('click', e => { if (e.target === sheet) this.closeSheet(sheet); });
    }
    this.watchTopBar();
  }

  /**
   * The unlock card sits just under the top bar, and the line of help and the status line just above the objective
   * card, whatever their heights are on this screen and at this text size (--top-h and --bottom-h in the stylesheet).
   * The status line stands above the line of help, which wraps and grows upward: by its height (--hint-h).
   */
  watchTopBar() {
    const bar = $('topbar'), card = $('objective'), hint = $('hint'), root = document.documentElement;
    let top = '', bottom = '', tall = '';
    const measure = () => {
      const t = Math.ceil(bar.getBoundingClientRect().bottom) + 'px';
      if (t !== top) root.style.setProperty('--top-h', top = t);
      const h = hint ? hint.getBoundingClientRect().height : 0;   // 0 while hidden: it keeps the height it was shown at
      if (h > 0 && Math.ceil(h) + 'px' !== tall) root.style.setProperty('--hint-h', tall = Math.ceil(h) + 'px');
      if (!card || typeof innerHeight !== 'number') return;
      const r = card.getBoundingClientRect();
      if (!r.height) return;   // hidden with the rest of the interface: keep where it was
      const b = Math.ceil(innerHeight - r.top) + 'px';
      if (b !== bottom) root.style.setProperty('--bottom-h', bottom = b);
    };
    if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(measure); ro.observe(bar); if (card) ro.observe(card); if (hint) ro.observe(hint); }
    addEventListener('resize', measure);   // turning the phone moves the card without always resizing it
    measure();
  }

  // --- cash ---------------------------------------------------------------
  setCash(v, instant = false) {
    this.target = v;
    if (instant) { this.shown = v; this.renderCash(); }
  }
  /**
   * The cash answers a coin that lands on it. Many coins land in a row when workers sell: a bump that is still
   * running is not started again (no jitter), and no layout is forced to restart it (the Web Animations API).
   */
  bumpCash() {
    const e = this.cashEl, root = document.documentElement;
    if (root.classList.contains('calm')) return;
    if (typeof e.animate !== 'function') { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); return; }
    if (this.bumpAnim?.playState === 'running') return;   // still bouncing: the next coin rides on it
    this.bumpAnim = e.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
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

  // --- running boosts ---------------------------------------------------------
  /**
   * The boosts of the credits store that are running, as chips under the cash, each with its time left.
   * @param list  [{ key, label, seconds }] (js/sim/store.js, boostChips); an empty list hides the row
   */
  setBoosts(list) {
    const box = $('boosts'), keys = list.map(b => b.key).join('|');
    if (!box) return;
    if (keys !== this.boostKeys) {   // the chips are built again only when what runs changed; the time is written into them every second
      this.boostKeys = keys;
      box.hidden = !list.length;
      box.replaceChildren(...list.map(b => { const chip = el('span', 'boost-chip'); chip.append(el('b', '', b.label), el('span', 'boost-time')); return chip; }));
    }
    const times = box.querySelectorAll('.boost-time'), clock = s => {
      const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = String(s % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
    };
    list.forEach((b, i) => { const t = clock(Math.max(0, b.seconds)); if (times[i] && times[i].textContent !== t) times[i].textContent = t; });
  }

  // --- worker motivation ------------------------------------------------------
  /**
   * The Motivation chip: hidden until the Workers' Park stands. Written only when the state or the whole level changed,
   * which is once in about a minute of work at the most. @param v  parkView(company) (js/sim/hqview.js), or null
   */
  setMotivation(v) {
    const b = this.motivationChip;
    if (!b) return;
    const key = v ? v.state + v.level : '';
    if (key === this.motivationKey) return;
    this.motivationKey = key;
    b.hidden = !v;
    if (!v) return;
    b.className = 'motivation-chip ' + v.state;
    b.replaceChildren(icon(v.state), el('b', '', String(v.level)), el('span', '', v.stateName));
    b.setAttribute('aria-label', `Workers' motivation ${v.level} of 100, ${v.stateName}. Open the Workers' Park`);
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
      $('obj-fill').style.transform = `scaleX(${Math.round(Math.max(0, Math.min(1, o.progress)) * 200) / 200})`;   // a transform: the card is not laid out again
      $('obj-sub').textContent = o.sub || '';
    }
  }

  // --- unlock card (queued so two unlocks never overlap) -------------------
  /**
   * Announce something. It is shown as a card, which a tap sends away, and kept in the log behind the bell.
   * A card may have one button: `action` is its text and `onAction` what it does (the log keeps the words only).
   */
  unlock(card) {
    const symbol = card.symbol || KICKER_ICON[card.kicker] || 'award';
    this.journal.add({ kicker: card.kicker || 'Unlocked', title: card.title, desc: card.desc || '', symbol }, Date.now());
    this.storeLog();
    $('log-dot').hidden = false;
    this.unlockQueue.push({ ...card, symbol });
    if (!this.unlockBusy) this.nextUnlock(); else this.showWaiting();
  }
  nextUnlock() {
    clearTimeout(this.unlockTimer);
    const card = this.unlockQueue.shift(), box = $('unlock');
    const act = $('unlock-act');
    this.unlockNow = card || null;
    if (!card) { this.unlockBusy = false; box.classList.remove('show'); if (act) act.hidden = true; return; }
    this.unlockBusy = true;
    if (act) { act.hidden = !card.action; act.textContent = card.action || ''; }
    box.classList.toggle('has-act', !!card.action);
    document.querySelector('#unlock .u-kicker').textContent = card.kicker || 'Unlocked';
    $('unlock-icon').replaceChildren(icon(card.symbol)); $('unlock-title').textContent = card.title; $('unlock-desc').textContent = card.desc || '';
    this.showWaiting();
    box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
    this.unlockTimer = setTimeout(() => this.nextUnlock(), this.unlockQueue.length > 2 ? CARD_MS_BUSY : card.action ? CARD_MS_ACT : CARD_MS);
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
  bindSettings({ settings, onReset, onReplayTutorial, onRestore, onOpen, onClose, onToggle }) {
    const sheet = $('settings'), reset = $('btn-reset'), fs = $('btn-fullscreen');
    this.onSheets = open => (open ? onOpen?.() : onClose?.());
    const renders = [];
    // An on/off setting is a switch: drawn as one (css: .sheet-btn.toggle), and said as one to a screen reader.
    const bindToggle = (id, name, label) => {
      const b = $(id);
      b.setAttribute('role', 'switch');
      renders.push(() => { b.textContent = `${label}: ${settings[name] ? 'On' : 'Off'}`; b.classList.toggle('off', !settings[name]); b.setAttribute('aria-checked', String(!!settings[name])); });
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
    bindToggle('btn-saver', 'batterySaver', 'Battery saver');   // fewer pictures a second: js/engine/pace.js
    const motion = $('btn-motion');
    renders.push(() => {
      // When the device itself asks for less motion the game follows, and the switch has nothing left to decide.
      const forced = settings.systemCalm && !settings.reduceMotion;
      motion.textContent = forced ? 'Reduce motion: On, as your device asks' : `Reduce motion: ${settings.reduceMotion ? 'On' : 'Off'}`;
      motion.classList.toggle('off', !settings.calm); motion.disabled = forced;
      motion.setAttribute('aria-checked', String(!!settings.calm));
    });
    motion.setAttribute('role', 'switch');
    motion.addEventListener('click', () => { settings.toggle('reduceMotion'); onToggle?.('reduceMotion'); });
    const gfx = $('btn-graphics');
    renders.push(() => { gfx.textContent = 'Graphics: ' + GRAPHICS_LABEL[settings.graphics]; });
    gfx.addEventListener('click', () => { settings.nextGraphics(); onToggle?.('graphics'); });
    // the five levels side by side under the title: one press chooses a level, and the one in use is marked
    for (const level of GRAPHICS) {
      const b = $('gfx-' + level);
      if (!b) continue;
      renders.push(() => b.setAttribute('aria-pressed', String(settings.graphics === level)));
      b.addEventListener('click', () => { if (settings.graphics !== level) { settings.set('graphics', level); onToggle?.('graphics'); } });
    }
    const render = () => { for (const r of renders) r(); };
    settings.onChange(render);   // the mute key and the system's motion setting change these from outside the sheet
    render();
    if (!navigator.vibrate) $('btn-haptics').hidden = true;
    // Keyboard shortcuts are for a keyboard: a phone or tablet does not list them.
    if (typeof matchMedia === 'function' && !matchMedia('(hover: hover) and (pointer: fine)').matches) $('btn-keys').hidden = true;

    const close = () => this.closeSheet(sheet);
    // A backup file can be opened here too. The Headquarters, whose Records tab does the same, is there from two yards
    // on, and the game that needs a backup most has one: after a reset, or on another device. The file is read and
    // checked (js/sim/backup.js); nothing is replaced until the player has pressed again.
    const backup = $('btn-backup'), backupNote = $('backup-note'), backupFile = $('backup-file');
    let held = null;
    const forget = () => { held = null; backup.classList.remove('danger', 'confirm'); backup.textContent = 'Open a backup file'; backupNote.hidden = true; backupNote.textContent = ''; };
    backupFile.addEventListener('change', async () => {
      const file = backupFile.files?.[0];
      backupFile.value = '';   // so that choosing the same file again is noticed
      if (!file) return;
      let text = '';
      try { text = file.size > 4000000 ? 'x'.repeat(2000001) : await file.text(); } catch { text = ''; }   // a file that large is refused by its size alone
      const r = importSave(text, Date.now());
      forget();
      backupNote.hidden = false;
      if (!r.ok) { backupNote.textContent = r.reason; return; }
      held = r.save;
      backupNote.textContent = backupLine(r.summary, r.summary.exported ? new Date(r.summary.exported).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
      backup.classList.add('danger', 'confirm'); backup.textContent = 'Replace my game with this backup';
    });
    backup.addEventListener('click', () => { if (held) onRestore?.(held); else backupFile.click(); });
    sheet.onclosed = () => { reset.classList.remove('confirm'); reset.textContent = 'Reset progress'; forget(); };
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
   * @param yards  what ui-logic's yardRows returns: every yard in order. An open one is a button to go there;
   *   one that is not open says what it makes and what opens it, and is not a button.
   * @param onPick  called with the id of the chosen yard, after the sheet has closed
   */
  showYards(yards, onPick) {
    const sheet = $('yards'), list = $('yards-list');
    const num = y => { const n = el('span', 'r-num', String(y.index)); n.style.setProperty('--ground', '#' + (y.ground ?? 0x8a9099).toString(16).padStart(6, '0')); return n; };
    const rows = yards.map(y => {
      const body = el('span', 'r-body');
      if (!y.open) {   // not open yet: its name, where it is and what it makes, then what opens it
        // A gate the cash already covers is a button: it takes the player to the yard that has the gate (the arrows do the rest there).
        const row = el(y.ready ? 'button' : 'div', 'row locked' + (y.next ? ' next' : '') + (y.ready ? ' ready' : ''));
        if (y.ready) {
          row.type = 'button';
          const there = yards.find(r => r.id === y.goTo);
          row.addEventListener('click', () => { this.closeSheet(sheet); if (there && !there.here) onPick(y.goTo); });
        }
        const lock = el('span', 'r-lock'); lock.append(icon('lock'));
        body.append(el('span', 'r-title', y.name), el('span', 'r-sub', [y.place, y.makes].filter(Boolean).join(' · ')));
        if (y.needs) body.append(el('span', 'r-needs', y.needs));
        if (y.progress != null) { const bar = el('span', 'r-bar'), fill = el('i'); fill.style.width = Math.round(Math.min(1, y.progress) * 100) + '%'; bar.append(fill); body.append(bar); }
        row.append(num(y), body, y.ready ? el('span', 'r-tag', 'Go there') : lock);
        return row;
      }
      const row = el('button', 'row' + (y.here ? ' here' : ''));
      row.type = 'button';
      if (y.here) row.setAttribute('aria-current', 'location');
      body.append(el('span', 'r-title', y.name), el('span', 'r-sub', y.place));
      row.append(num(y), body);
      if (y.here) row.append(el('span', 'r-tag', 'You are here'));
      row.addEventListener('click', () => { this.closeSheet(sheet); if (!y.here) onPick(y.id); });
      return row;
    });
    const open = yards.filter(y => y.open).length;
    $('yards-note').textContent = open < yards.length ? `${open} of ${yards.length} yards ${open === 1 ? 'is' : 'are'} open. Tap an open yard to go there.` : 'Every yard is open. Tap one to go there.';
    list.replaceChildren(...rows);
    const here = list.querySelector('.here');
    this.openSheet(sheet, here);
    here?.scrollIntoView?.({ block: 'center' });   // twenty rows do not fit a phone: the list opens where the player is
  }

  // --- the log ----------------------------------------------------------------
  /** Keep the log on the device, beside the save. A browser that keeps nothing still has it until the page is closed. */
  storeLog() {
    if (!this.logKey || this.logOff) return;
    try { localStorage.setItem(this.logKey, JSON.stringify(this.journal)); } catch { /* private mode, or full */ }
  }
  /** "Reset progress": the log goes with the progress it tells of, and nothing more is written before the page loads again. */
  clearLog() {
    this.logOff = true;
    this.journal.load([]);
    if (this.logKey) try { localStorage.removeItem(this.logKey); } catch { /* nothing to remove */ }
  }
  showLog() {
    const sheet = $('log'), list = $('log-list');
    const times = [];
    const rows = this.journal.items.map(e => {
      // A line about the company leads to its tab in the Headquarters ("collect your reward" opens Goals); the rest is news.
      const tab = this.onLogPick ? logTarget(e) : null;
      const row = el(tab ? 'button' : 'div', 'row' + (tab ? ' go' : '')), body = el('span', 'r-body'), when = el('span', 'r-when');
      const tile = el('span', 'r-icon'); tile.append(icon(e.symbol));
      const kicker = el('span', 'r-kicker', e.kicker + ' · '); kicker.append(when);
      body.append(kicker, el('span', 'r-title', e.title));
      if (e.desc) body.append(el('span', 'r-sub', e.desc));
      row.append(tile, body);
      if (tab) {
        row.type = 'button';
        const go = el('span', 'r-go'); go.setAttribute('aria-hidden', 'true'); go.append(icon('deliver'));
        row.append(go);
        row.addEventListener('click', () => { this.closeSheet(sheet); this.onLogPick(tab); });
      }
      times.push([when, e.at]);
      return row;
    });
    if (!rows.length) rows.push(el('div', 'sheet-note', this.logKey ? 'Nothing yet. What you unlock and reach is listed here, and kept on this device.' : 'Nothing yet. What you unlock and reach is listed here until you close the game.'));
    list.replaceChildren(...rows);
    const tell = () => { const now = Date.now(); for (const [when, at] of times) when.textContent = ago((now - at) / 1000); };
    tell();
    const timer = setInterval(tell, 20000);   // an open log keeps its times true
    sheet.onclosed = () => clearInterval(timer);
    this.journal.seen();
    $('log-dot').hidden = true;
    this.openSheet(sheet);
  }

  // --- the money sheet ---------------------------------------------------------
  /** A tap on the cash: what comes in and what goes out, a minute at a time. Opened again, it shows the figures of that moment. */
  showCash() {
    const got = this.onCash?.() || {}, f = cashFacts(got.summary || null);
    const row = r => { const d = el('div', 'm-row'), v = el('dd', r.tone || '', r.text); d.append(el('dt', '', r.name), v); return d; };
    $('money-rows').replaceChildren(...f.rows.map(row));
    $('money-rows').hidden = !f.rows.length;
    $('money-costs').replaceChildren(...f.costs.map(row));
    $('money-costs').hidden = $('money-costs-title').hidden = !f.costs.length;
    $('money-note').textContent = f.note;
    $('money-finance').hidden = !got.finance;
    this.openSheet($('money'));
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
   * @param o {{ earned, seconds, capped, away, share, afterCosts, left, allowance, ships? }}  the pay and its terms, in dollars and
   *   seconds, and the ships that came home in that time ({ ships, cash }: already paid)
   */
  showOffline(o, onCollect) {
    const sheet = $('offline'), btn = $('off-collect'), facts = awayFacts(o);
    $('off-amount').textContent = '$' + fmt(o.earned);
    $('off-away').textContent = facts.away;
    $('off-time').textContent = facts.paid;
    $('off-share').textContent = facts.rate;
    $('off-left').textContent = facts.left;
    $('off-ships').textContent = facts.ships; $('off-ships').hidden = !facts.ships;   // a ship of the Port that came home meanwhile
    sheet.hidden = false;
    btn.focus({ preventScroll: true });
    btn.onclick = () => { sheet.hidden = true; btn.onclick = null; onCollect(); };
  }

  /** The game is ready: the loading screen leaves, or turns into the start screen on a first visit. */
  hideLoading() { loading.finish(this.start || {}); }
}
