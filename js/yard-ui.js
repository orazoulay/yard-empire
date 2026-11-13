// The yard's interface where it meets the running game: what the labels in the yard say, the carry
// bubble, being shown the way, going to a yard, the keyboard shortcuts, the comfort settings, hiding
// the interface, and whether the game is saved. The HUD draws; this file decides what, from game state.
import { AREAS, ITEMS, RECIPES } from './data/areas.js';
import { LOCATIONS } from './data/company.js';
import { loading } from './loading.js';
import { carryText, plotNote, yardRows, machineCounts, shortcutFor, saveStatus } from './ui-logic.js';

const LABEL_EVERY = 0.25;   // seconds between label updates: four times a second reads as live and costs nothing
const RATE_EVERY = 4;       // label updates between two readings of the company's income: once a second
const NEAR = 15;            // a machine this close to the player shows its state; further away, only its name
const PEEK = 2.4;           // seconds the camera spends going to the objective and back
const PEEK_OUT = 0.25, PEEK_BACK = 0.78;   // the reveal in main.js eases in until the first and out from the second
const RING = 4;             // seconds the objective stays ringed after the player asked for the way
const SAVING_SHOWN = 1.2;   // an upload takes a blink; say so long enough to be read
const PROBE_EVERY = 30;     // seconds between checks that this browser still keeps what the game writes
const PROBE_KEY = 'lumber-tycoon-probe';

const el = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
const typing = e => e.target instanceof HTMLElement && e.target.matches('input:not([type="range"]), textarea, select');

export class YardUi {
  /**
   * @param game  the Game of main.js; built after its HUD, settings, sound and Headquarters
   * @param ring  a Pulse (guide.js) of its own, to ring the objective with when the player asks for the way
   */
  constructor(game, ring) {
    this.game = game; this.hud = game.hud; this.settings = game.settings;
    this.calm = false;
    this.labelTimer = 0; this.rateIn = 0; this.probeTimer = 0; this.savingFor = 0; this.stored = true;
    this.peek = null;                 // { zone, t } while the objective is ringed
    this.ring = ring;
    this.bare = false;
    this.detailed = new Set();        // machines whose label shows state right now
    this.parts = new WeakMap();       // machine or plot -> the pieces this file added to its label
    this.carry = { type: null, count: -1, cap: -1 };
    this.buildBubble();

    const hud = this.hud;
    hud.onShowWay = () => this.showWay();
    hud.onYardChip = () => this.openYards();
    hud.onBare = () => this.hide();
    this.settings.onChange(() => this.applyComfort());
    this.applyComfort();
    addEventListener('keydown', e => this.key(e), true);   // before the sheets' own Escape handlers: only the sheet on top closes
    this.unbare = () => this.show();

    // A first visit gets the start screen; its button is also the touch a browser wants before it plays sound.
    hud.start = {
      first: loading.firstVisit(game.saveKey), yards: AREAS.length,
      onStart: () => { game.sfx.unlock(); game.sfx.click(); },
      // Already playing elsewhere: the account sheet, on its "Sign in" side. Only where accounts exist.
      onSignIn: game.account?.supported ? () => { document.getElementById('btn-account')?.click(); document.getElementById('acc-tab-in')?.click(); } : null,
    };

    // Everyone is told once how to walk: the keys at a keyboard, and on a touch screen a finger that drags,
    // shown by a touch point sliding to and fro, because the stick is invisible until a finger lands.
    // A touch player who has finished the tutorial already knows: they are not told again after an update.
    this.moveHint = '';
    const keyboard = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!this.settings.moveHintSeen && (keyboard || !game.econ.tutorialDone)) {
      this.moveHint = 'wait';
      this.moveText = keyboard ? 'WASD or arrow keys to move' : 'Drag anywhere to walk';
      this.dragShow = keyboard ? null : el('div', 'drag-show');
      if (this.dragShow) { this.dragShow.hidden = true; this.dragShow.setAttribute('aria-hidden', 'true'); document.getElementById('fx').append(this.dragShow); }
      game.input.onFirstMove = () => {
        if (this.moveHint === 'shown') hud.hideHint();
        this.dragShow?.remove(); this.dragShow = null;
        this.moveHint = '';
        this.settings.set('moveHintSeen', true);
      };
    }
  }

  // --- once a frame ---------------------------------------------------------------------------------
  frame(dt) {
    const g = this.game;
    if (this.calm) g.punch = 0;   // less motion: the camera does not push in for big moments
    this.bubble();
    if (g.account.busy) this.savingFor = SAVING_SHOWN; else if (this.savingFor > 0) this.savingFor -= dt;
    this.labelTimer -= dt;
    if (this.labelTimer <= 0) { this.labelTimer = LABEL_EVERY; this.slow(); }
    if (this.peek) this.lookOn(dt);
    this.ring.update(dt, this.peek ? this.peek.zone : null);
    if (this.moveHint === 'wait' && loading.gone && !g.paused && !g.hqOpen) {
      this.moveHint = 'shown'; this.hud.hint(this.moveText);
      if (this.dragShow) this.dragShow.hidden = false;
    }
  }
  /** Four times a second: the labels in the yard and the save status; once a second, the income beside the cash. */
  slow() {
    const g = this.game;
    this.plots();
    this.machines();
    if (--this.rateIn <= 0) { this.rateIn = RATE_EVERY; this.hud.setRate(g.company.founded ? g.company.summary().profit : null); }
    this.probeTimer -= LABEL_EVERY;
    if (this.probeTimer <= 0) { this.probeTimer = PROBE_EVERY; this.stored = this.probe(); }
    const acc = g.account;
    this.hud.setSave(saveStatus({ user: !!acc.user, online: acc.online && navigator.onLine !== false, busy: this.savingFor > 0, stored: this.stored }));
  }
  /** Does this browser keep what the game writes? A private window may refuse, and then "Saved" would be untrue. */
  probe() {
    if (this.game.noSave) return this.stored;   // a reset or a change of player is under way: nothing is written on purpose
    try { localStorage.setItem(PROBE_KEY, '1'); localStorage.removeItem(PROBE_KEY); return true; } catch { return false; }
  }

  // --- the carry bubble -------------------------------------------------------------------------------
  buildBubble() {
    const box = this.game.bubble.el, bar = el('span', 'b-bar');
    this.bName = el('span', 'b-name'); this.bCount = el('span', 'b-count'); this.bFill = el('i', '');
    bar.append(this.bFill);
    box.replaceChildren(this.bName, this.bCount, bar);
  }
  /** What the player carries, by name, how many, and a thin bar for how full the hands are. Written only when it changes. */
  bubble() {
    const g = this.game, c = g.player.carry, last = this.carry, cap = g.econ.capacity;
    g.bubble.visible = !c.empty;
    if (c.empty || (c.type === last.type && c.count === last.count && cap === last.cap)) return;
    last.type = c.type; last.count = c.count; last.cap = cap;
    const t = carryText({ label: ITEMS[c.type].label, count: c.count, capacity: cap });
    g.bubble.el.className = 'label bubble' + (t.full ? ' max' : '');
    this.bName.textContent = t.name;
    this.bCount.textContent = t.count;
    this.bFill.style.width = Math.round(t.fill * 100) + '%';
  }

  // --- labels in the yard ---------------------------------------------------------------------------
  /**
   * Under each plot's price: what was paid of it, what is still missing when the cash is close, what to do when
   * it is there, and, to a player who stands on it without the money, what to sell for the rest.
   * A payment that has just landed gives the plot's ring a short pulse.
   */
  plots() {
    const g = this.game, cash = g.econ.cash, p = g.player.pos;
    for (const a of g.areas) {
      const plot = a.open && a.plot;
      if (!plot) continue;
      let part = this.parts.get(plot);
      if (!part) {
        part = { note: el('div', 'note'), text: '', paid: g.econ.paid[plot.upgrade.id] || 0 };
        part.note.hidden = true;
        plot.label.el.append(part.note);
        this.parts.set(plot, part);
      }
      const u = plot.upgrade, paid = g.econ.paid[u.id] || 0;
      plot.label.el.classList.toggle('paying', paid > part.paid);   // on for one look, a quarter of a second
      part.paid = paid;
      const standing = Math.hypot(plot.x - p.x, plot.z - p.z) <= (plot.radius || 0);
      const text = plotNote({ cash, remaining: g.econ.remaining(u.id), cost: u.cost, standing, goods: ITEMS[a.cfg.workerJob?.items[0]]?.label || '' });
      if (text === part.text) continue;
      part.text = text; part.note.textContent = text; part.note.hidden = !text;
    }
  }
  /** Near the player a machine's label shows the batch in work and what waits in and out; far away, only its name. */
  machines() {
    const g = this.game, p = g.player.pos, here = g.playerArea.stations;
    for (const s of this.detailed) {
      if (here.includes(s) && Math.hypot(s.x - p.x, s.z - p.z) < NEAR) continue;
      this.detailed.delete(s);
      s.nameLabel.el.classList.remove('near');
    }
    for (const s of here) {
      if (s.type !== 'processor' || Math.hypot(s.x - p.x, s.z - p.z) >= NEAR) continue;
      let part = this.parts.get(s);
      if (!part) {
        part = { fill: el('i', ''), counts: el('span', 's-counts'), progress: -1, text: '' };
        const state = el('span', 's-state'), bar = el('span', 's-bar');
        bar.append(part.fill); state.append(bar, part.counts);
        s.nameLabel.el.append(state);
        this.parts.set(s, part);
      }
      if (!this.detailed.has(s)) { this.detailed.add(s); s.nameLabel.el.classList.add('near'); }
      const progress = s.sim.busy ? Math.round(s.sim.progress * 50) / 50 : 0;
      if (progress !== part.progress) {
        part.fill.style.transition = progress < part.progress ? 'none' : '';   // a new batch starts from empty at once, it does not run backwards
        part.fill.style.transform = `scaleX(${progress})`;
        part.progress = progress;
      }
      const text = machineCounts(s.sim);
      if (text !== part.text) { part.text = text; part.counts.textContent = text; }
    }
  }

  // --- being shown the way --------------------------------------------------------------------------
  /** The objective card was tapped: ring the target, and let the camera go and look at it for a moment. */
  showWay() {
    const g = this.game;
    if (g.paused || g.hqOpen || g.reveal) return;
    const obj = g.objective(), zone = g.tutorial.active ? g.tutorial.zone(obj) : obj?.zone;
    if (!zone) return;
    this.peek = { zone, t: 0 };
    // The same pan a newly opened yard gets. With less motion the camera stays and the ring and the arrows do the showing.
    if (!this.calm) g.reveal = { t: 0, dur: PEEK, target: { x: zone.x, z: zone.z }, peek: true };
    g.sfx.click();
  }
  lookOn(dt) {
    const g = this.game, pk = this.peek, r = g.reveal;
    pk.t += dt;
    // The player wants to walk on: turn the camera back now, from wherever it has got to, without a jump.
    if (r && r.peek && g.input.steering) {
      const x = r.t / r.dur;
      if (x < PEEK_BACK) r.t = r.dur * (x < PEEK_OUT ? PEEK_BACK + (1 - PEEK_BACK) * (1 - x / PEEK_OUT) : PEEK_BACK);
    }
    if (pk.t > RING) this.peek = null;
  }

  // --- going to a yard ------------------------------------------------------------------------------
  openYards() {
    const g = this.game;
    if (g.reveal) return;
    const place = id => LOCATIONS.find(l => l.id === id)?.name || '';
    // every yard of the game: the open ones to go to, the others with what they make and what opens them
    const yards = yardRows({ areas: AREAS, econ: g.econ, here: g.playerArea.id, place, items: ITEMS, recipes: RECIPES });
    this.hud.showYards(yards, id => { if (g.travel(id)) g.sfx.click(); });
  }

  // --- comfort ----------------------------------------------------------------------------------------
  /** Less motion and larger text are classes on the page, so the stylesheet does the work; confetti and camera ask here. */
  applyComfort() {
    const s = this.settings, root = document.documentElement;
    this.calm = s.calm;
    root.classList.toggle('calm', this.calm);
    root.classList.toggle('big-text', s.largeText);
    this.game.fx.calm = this.calm;
  }

  // --- hiding the interface -----------------------------------------------------------------------------
  /** For looking at the yard or taking a picture: bar, cards and labels go, and the next tap anywhere brings them back. */
  hide() {
    if (this.bare) return;
    this.bare = true;
    document.documentElement.classList.add('bare');
    this.hud.hint('Tap anywhere to bring the interface back', 2400);
    addEventListener('pointerdown', this.unbare, true);
  }
  show() {
    if (!this.bare) return;
    this.bare = false;
    document.documentElement.classList.remove('bare');
    removeEventListener('pointerdown', this.unbare, true);
    this.hud.hideHint();
  }

  // --- keyboard shortcuts -----------------------------------------------------------------------------
  key(e) {
    if (e.repeat) return;
    const what = shortcutFor(e, typing(e));
    if (!what || !loading.gone) return;
    const g = this.game, hud = this.hud;
    if (what === 'close') {
      if (this.bare) { this.show(); return; }
      if (hud.closeTop()) e.stopImmediatePropagation();   // the Headquarters under it stays open; it and the account sheet close themselves
      return;
    }
    if (this.bare) this.show();
    if (g.offlineOpen || g.account.open) return;   // those two want an answer first
    if (what === 'help') {
      e.preventDefault();
      const sheet = document.getElementById('keys');
      if (sheet.hidden) hud.showKeys(); else hud.closeSheet(sheet);
    } else if (what === 'mute') {
      const muted = this.settings.mute();
      g.sfx.unlock();
      if (!muted) g.sfx.click();
      hud.hint(muted ? 'Sound off' : 'Sound on', 1600);
    } else if (what === 'hq') {
      if (hud.sheetOpen) return;
      if (g.hq.isOpen) g.hq.close(); else g.hq.open();   // open() does nothing before the company is founded
    }
  }
}
