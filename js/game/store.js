// The credits store in the running game. The rules are in js/sim/store.js; this file gives them what only the game
// has: the server's answer (js/credits.js), the machines of the yards, the workers, the line of help and the save.
// The server's receipts are handed to the rules, which apply each one once; what was done is said and saved in the
// same moment, so that a receipt and the save that remembers it cannot come apart. That happens once a second with the
// other company chores, and at once when the server's answer changes: the chores rest while a sheet is open (the game
// is paused under it), and a purchase is made with the store's sheet open.
import { applyReceipts, markApplied, fillMachines, preview, receiptLine, boostChips, runnerReturn, settleDue, dueList, seasonStep, seasonState, seasonCollect, seasonOwed, cardState, cardCollect, itemDoing, itemTitle, localDay, tradeCash } from '../sim/store.js';
import { money } from '../format.js';
import { TUNING } from '../data/tuning.js';
import { today } from './company-chores.js';
import { EFFECT_ICON } from '../icons.js';

/**
 * What the line of help says about the purchases of one answer: each on a line of its own (the line wraps and grows
 * upward: css/style.css, #hint). A kept purchase says why in a sentence of its own, and a yard's name is long, so a
 * phone needs the room.
 */
export const hintText = lines => lines.join('\n');
/** A yard that was opened and saved but could not be shown: the player is told how to see it. */
export const reloadLine = name => `${name} is open and saved. Reload the game to see it.`;
/** Said once when the store's part of the game stopped for the visit (storeStop). */
export const STOPPED_LINE = 'The credits store stopped working in this visit. Reload the game to start it again: nothing you bought is lost.';

/** A yard whose workers have nothing to carry (the Port: its job lists no goods). Extra workers would stand at its spawn point. */
const idleYard = a => a.cfg?.workerJob?.items?.length === 0;

/** The credits store of the Game. */
export class StoreMethods {
  /** Once, when the game starts: the company asks the server's answer what is owned, and follows it when it changes. */
  bindStoreRules() {
    this.storeTold = new Set();   // receipts the player was told are kept for later, in this visit: said once each
    this.storeHeld = [];          // those receipts, for the store's page: [{ id, name, why }]
    this.storeBroken = false;     // the rules threw outside any one purchase: the store rests until the game is loaded again (storeStop)
    this.storeFailed = new Set(); // receipts whose effect threw in this visit: each is logged once
    this.storeFailTold = false;   // the player was told, once in this visit, that a purchase could not be applied
    this.storeListed = '';        // the ids of storeHeld as the store's page last drew them
    this.storeAnswered = this.credits.ready;   // the store has answered in this visit: a 404 after that is an answer lost, not a backend without a store
    this.cardTold = null;         // the day (cardDay) the player was last told that the Monthly card has that day's to collect: once a day, in a tab left open overnight too
    // The store block may not be known: a signed-in player's game whose save could not be pulled as it started (no
    // connection, or the server's save did not answer: js/account.js) and whose device copy has no block, or one an
    // earlier such visit started (js/sim/sync.js, UNCHECKED). The server may keep the right one: the purchases already
    // applied, a piggy bank, a season, a card, a ticket. Until the server's save is in (storeCheck), no receipt is
    // applied, the card is not collected, a holder's reward waits, the store's page sells nothing, and an upload
    // carries no block (js/account.js, push): the server keeps its own. What the visit writes into its block meanwhile
    // carries the flag that says so (js/sim/company.js, storeUnsure).
    const acc = this.credits.account;
    this.storeUnknown = !!this.credits.offered && !!acc?.user && acc.pulled === false && this.company.storeFrom !== 'save';
    this.company.storeUnsure = this.storeUnknown;
    this.storeAsking = false;     // the server's save is being asked for
    this.storeAskAt = 0;          // not asked again before this time (ms): the last question had no answer
    if (acc) acc.holdStore = () => this.storeUnknown;
    this.company.setOwns(id => this.credits.owns(id), id => this.credits.level(id));
    // The season (js/sim/store.js): which months the Season pass was held for is the server's word, and so is the time,
    // once it has answered. While its answer is on its way the season does not turn: this device's clock may be wrong.
    // Nor does it on a device's date moved since the server's last answer (`moved`, read after clockSure, which notices it).
    this.company.setSeason((id, month) => (this.storeUnknown ? null : this.credits.heldMonth(id, month)),
      () => (this.credits.status === 'loading' ? null : { now: this.credits.now(), sure: this.credits.clockSure, moved: this.credits.moved === true }));
    this.credits.onChange(() => { if (this.credits.ready) this.storeAnswered = true; this.storeOwned(); this.storeChores(); });
    this.storeOwned();
  }
  /** What is owned may have changed (the server answered, or stopped answering): fold it into the company and the yards. */
  storeOwned() {
    this.company.applyMods();
    this.syncCrew();
    this.syncPads();
    this.syncRunner();
    this.company.extraGoal();   // the Fourth daily goal: today's goals were drawn before this answer, so the fourth is added now
  }

  /**
   * While the store block is not known (bindStoreRules): the first time the server can be reached (its store has
   * answered), its save is asked for, once; without an answer, again half a minute later.
   */
  storeCheck() {
    const acc = this.credits.account;
    if (!this.storeUnknown || this.storeAsking || !this.credits.ready || Date.now() < this.storeAskAt || typeof acc?.serverSave !== 'function') return;
    this.storeAsking = true;
    const again = () => { this.storeAsking = false; this.storeAskAt = Date.now() + 30000; };
    acc.serverSave().then(r => {
      if (!r) { again(); return; }
      this.storeAsking = false;
      this.storeKnown(r.save);
    }, again);
  }
  /**
   * The server's save is in: a block it keeps is taken over, in place of the one this visit started from nothing (the
   * rest of the progress stays the device's); without one, the visit's block is the block. Saved at once, and the
   * receipts are applied as usual, against the block that knows which were applied.
   */
  storeKnown(server) {
    if (!this.storeUnknown) return;
    const block = server?.company?.store;
    if (block && typeof block === 'object' && !Array.isArray(block)) this.company.adoptStore(block);
    this.storeUnknown = false;
    this.company.storeUnsure = false;
    this.save();
    this.storeOwned();
    this.storeChores();
    this.afterHandOut();   // the cash, the chips and the store's page follow
  }

  // --- the offers: the Monthly card, the season, the Event ticket ---------------------------------------------------
  /** The player's day by their own calendar, counted on the server's clock once it has answered: the Monthly card's day. */
  cardDay() { return localDay(this.credits.now()); }
  /** The last day the Monthly card can be collected for: the day its 30 days run out, by the server's word; 0 when that is not known (nothing is collected). */
  cardLast(item) {
    const until = this.credits.pass(item.id)?.until;
    return until > 0 ? localDay(until - 1) : 0;
  }
  /**
   * The Monthly card as it stands today (js/sim/store.js, cardState), or null where there is none. The last day it
   * can be collected for is the day its 30 days run out, by the server's word: a clock set ahead collects no more
   * days than were paid for, and a card whose last day is not known collects nothing. It is collected only on a clock
   * that is sure (js/credits.js, clockSure): a device's date moved after the server's answer counts no day, and the
   * card waits (`unsure`) until the server has said the time again.
   */
  cardNow() {
    const item = itemDoing(this.company, 'card');
    if (!item || this.storeUnknown) return null;   // the day collected is in a block nobody knows yet
    const s = cardState(this.company, this.cardDay(), this.cardLast(item));
    return s.ready && !this.credits.clockSure ? { ...s, ready: false, unsure: true } : s;
  }
  /**
   * Collect today's from the Monthly card (the store's page): handed out, said and saved in the same moment. The day
   * and the card's last day are checked here, whatever was drawn before.
   * @returns what was collected, or null; with `full`, nothing was collected (no room for one of its items) and why
   */
  collectCard() {
    const s = this.cardNow(), item = itemDoing(this.company, 'card');
    const got = s && s.ready && item ? cardCollect(this.company, this.cardDay(), Date.now(), this.cardLast(item)) : null;
    if (!got || got.full) return got;
    this.save();
    this.storeSay(got.gave.map(g => receiptLine(g.item, g.done)));
    this.afterHandOut();
    return got;
  }
  /** Say on the line of help what the game gave: each thing on a line of its own, for longer the longer it is (hintText). */
  storeSay(lines) {
    const said = hintText(lines);
    this.hud.hint(said, Math.max(3600, 60 * said.length));
  }
  /**
   * Collect the next step of the season (the Goals tab): its gift, and a pass holder's reward. Not while the store block
   * is not known (bindStoreRules), as the Monthly card is not: the server's block may have collected those steps, and
   * once it is taken over they would be paid again. @returns what was collected, or null
   */
  collectSeason() {
    if (this.storeUnknown) return null;
    const got = seasonCollect(this.company);
    if (!got) return null;
    this.save();
    if (got.pass) this.storeSay([receiptLine(got.pass.item, got.pass.done)]);
    this.afterHandOut();
    return got;
  }
  /**
   * The season as it stands, for the Goals tab and the store's page (js/sim/store.js, seasonState), or null where there
   * is none. `unchecked`: the store block is not known, so nothing of it is collected yet (collectSeason).
   */
  seasonNow() { const s = seasonState(this.company); return s && { ...s, unchecked: !!this.storeUnknown }; }
  /** The closed months whose Season pass rewards wait in the save for the store's word (js/sim/store.js, seasonOwed), for the pass's row. */
  seasonOwedNow() { return this.storeUnknown ? [] : seasonOwed(this.company); }
  /**
   * What a waiting Event ticket can start, for the store's page (Company.ticketChoices). The day's own event is
   * today's first: the chores rest while the store's sheet is open, and after midnight a ticket would be offered, and
   * spent, on the event the new day brings by itself.
   */
  ticketChoices() { this.company.refreshGoals(today()); return this.company.ticketChoices(); }
  /** The player chose the ticket's event: it starts, and is saved in the same moment, so the choice survives whatever the page does next. */
  chooseEvent(id) {
    this.company.refreshGoals(today());   // as above: an event that today runs by itself is never bought with a ticket
    const started = this.company.useTicket(id);
    if (!started) return false;
    this.save();
    // the hours the ticket adds: fewer than its own when the calendar runs the same event within them (an event counts once)
    const h = n => `${n} hour${n === 1 ? '' : 's'}`;
    const desc = started.adds < started.hours ? `${started.event.desc}: your ticket adds ${h(started.adds)} to the calendar's own` : `${started.event.desc} for ${h(started.hours)}`;
    this.hud.unlock({ icon: started.event.icon, title: started.event.name, desc, kicker: 'Event' });
    this.afterHandOut();
    return true;
  }
  /** After the game gave something itself: the cash, the chips and the store's page follow. */
  afterHandOut() {
    this.hud.setCash(this.econ.cash);
    this.hud.setBoosts(boostChips(this.company, Date.now()));
    this.refreshPlots();
    this.store?.render();
  }
  /**
   * The offers of which something waits in the saved game, for the store's page: their rows stay whether or not the
   * server sells them now (js/credits.js, items): a ticket that waits for its event, a purchase of the piggy bank that
   * waits for it to fill, and a closed month whose Season pass rewards wait for the store's word. None while the store
   * block is not known: what this visit's block holds may not be the player's.
   * @returns the catalog ids
   */
  storeKeeps() {
    if (this.storeUnknown) return [];
    const flags = this.company.store.flags, of = does => itemDoing(this.company, does)?.id;
    return [flags.eventTicket && of('event_ticket'), flags.bankFull && of('piggy'), seasonOwed(this.company).length > 0 && of('season')].filter(id => typeof id === 'string');
  }
  /** What was handed out and waits to be given, for the store's page: [{ name, why }]. */
  storeWaiting() {
    return dueList(this.company).map(d => ({ name: d.left > 1 ? `${d.item.name} (${d.left})` : d.item.name, why: 'It is given as soon as it can start.' }));
  }
  /**
   * "Open the next yard" was applied by the rules (js/sim/store.js, open_gate): in the save the gate is paid and the
   * yard behind it is open. Here the world follows, as it does when a gate is paid at its plot (js/game/feedback.js,
   * onPay): the gate swings open, the yard is built, the store's sheet steps aside and the camera shows the yard. The
   * yard the gate stands in keeps its plot unless that plot was the gate's own: a yard that is not fully built still
   * has its next upgrade to pay. storeChores() has closed the store's sheet before, and catches what this throws.
   * @param done  what the rules did: { gate: the gate's upgrade id, yard: the yard it stands in }
   */
  showGate(done) {
    const area = this.area(done.yard), u = this.econ.get(done.gate);
    if (!area || !u) return;
    area.applyUpgrade(u, false);
    if (area.plot?.upgrade.id === u.id) area.spawnNextPlot();
    this._views = null;
    this.feel('gate');
    this.hud.unlock({ symbol: EFFECT_ICON[u.effect.type], title: u.label, desc: u.desc, kicker: 'New area' });
    this.celebrate();
  }
  /**
   * For the card of a sale of the company (js/hq/build.js): 'owned' when the Family yard is owned, 'none' when it is
   * not or cannot be (the server says it is not owned; nobody is signed in; a server without credits), and 'unknown'
   * whenever someone is signed in where credits are offered but the store's answer is not in hand: the first seconds
   * of a visit ('loading'), no connection ('offline'), and an answer dropped in the middle of a visit, which js/credits.js
   * marks 'guest' (a 401: the session ran out) or 'off' (a 404, once the store has answered in this visit) while the
   * player is still signed in. A 404 from the first request is a backend without the store: nothing can be owned there,
   * and a warning on every sale would never come true. A sale cannot be undone: what cannot be told is said, never
   * taken for "not owned".
   */
  familyState() {
    if (this.company.mods.familyYard > 0) return 'owned';
    const c = this.credits;
    if (!c.offered || !c.account?.user || c.ready) return 'none';
    return c.status === 'off' && !this.storeAnswered ? 'none' : 'unknown';
  }
  /**
   * The Bigger crew: every open yard has as many extra workers as the company's modifiers say (js/area.js, setCrew);
   * none in a yard whose workers have no goods to carry (the Port: its job lists none, so a worker would stand there).
   */
  syncCrew() {
    const n = this.company.mods.crew || 0;
    for (const a of this.areas) if (a.open) a.setCrew(idleYard(a) ? 0 : n);
  }
  /** The Mechanic: every machine's output pad holds its own size (js/data/tuning.js) times what the company's modifiers say. */
  syncPads() {
    const cap = Math.round(TUNING.processor.outputCap * (this.company.mods.outputCap || 1));
    for (const sim of this.machineSims()) sim.outputCap = cap;
  }
  /**
   * The Runner: one more worker in the yard the player stands in, who carries what the company's modifiers say; none
   * while the item is not owned. When the player walks on, the Runner of the yard left puts back what it carries
   * (js/sim/store.js, runnerReturn: onto the pad of a machine that makes it, or the pile), and the next yard gets its own.
   */
  syncRunner() {
    const load = this.company.mods.runner || 0;
    for (const a of this.areas) {
      if (!a.open) continue;
      const want = a === this.playerArea && !idleYard(a) ? load : 0;   // none in the Port, as for the Bigger crew
      if (a.runner && !want) runnerReturn(a.runner.carry, this.stationViews(), a.id);
      a.setRunner(want);
    }
  }
  /** The wait before a character moves the next good at a pile, a pad or a counter (js/stations.js): none for the player with the Auto-collector. */
  padWait(ch, rate) { return ch === this.player && this.company.mods.noWait ? 0 : rate; }
  /** The rules of every machine in every open yard (js/sim/processor.js). */
  machineSims() { return this.areas.filter(a => a.open).flatMap(a => a.stations.filter(s => s.type === 'processor').map(s => s.sim)); }
  /** For the store's page: what an item would do right now, { usable, why?, cash?, note? } (js/sim/store.js, preview). */
  storeWorth(item) { return preview(this.company, item, Date.now(), this.machineSims()); }

  /**
   * The rules threw outside any one purchase: the store rests for the rest of this visit (better than the same failure
   * every second, and the chores after the store's go on), the error is logged and the player is told, once.
   * @param lines  what this pass of the chores says: the line is added to it
   */
  storeStop(e, lines) {
    if (this.storeBroken) return;
    this.storeBroken = true;
    console.error('The credits store stopped for this visit:', e);
    lines.push(STOPPED_LINE);
  }

  /**
   * Once a second (companyChores), and when the server's answer changes: apply its receipts, do what needs the yards,
   * say what was done, and save. What one pass has to say is said once, a line each (hintText): a line said alone
   * would be replaced by the next one of the same pass before anyone could read it.
   */
  storeChores() {
    const lines = [];
    // what the rules throw is caught where they are called (storeStop); a page that fails is not the store's to hide,
    // and what was done before it is said all the same
    try { this.storeWork(lines); } finally { if (lines.length) this.storeSay(lines); }
  }
  /** The work of storeChores(): what it has to say is pushed onto `lines`. */
  storeWork(lines) {
    const now = Date.now(), c = this.credits;
    this.syncCrew();   // a yard that has just opened gets its extra worker too
    this.syncPads();   // a machine that has just been built gets the Mechanic's pad
    this.syncRunner(); // the Runner follows the player from yard to yard
    this.hud.setBoosts(boostChips(this.company, now));   // what runs, and for how long: the chips count down with this
    if (!this.storeBroken) {
      try {
        // The season (js/sim/store.js, seasonStep): a month that turned is closed, and what a closed season owed a pass
        // holder is settled once the server has said whether the pass was held. Here and not when the game starts: a save
        // made before the pay for time away is worked out would lose the absence (js/game/saving.js).
        if (seasonStep(this.company)) this.save();
        // What the card or the season handed out and could not start (js/sim/store.js, handOut) is in the save, and needs
        // no answer of the server: it is given as soon as it can be, said and saved.
        const given = settleDue(this.company, now);
        if (given.length) {
          this.save();
          lines.push(...given.map(d => receiptLine(d.item, d.done)));
          this.afterHandOut();
        }
        const card = this.cardNow();
        if (card?.ready && this.cardTold !== this.cardDay()) {   // once a day: what was paid for is not left to be found
          this.cardTold = this.cardDay();
          lines.push(`Your Monthly card has today's ${card.gives.map(itemTitle).join(' and ') || 'collection'}. Collect ${card.gives.length === 1 ? 'it' : 'them'} in the store.`);
        }
      } catch (e) { this.storeStop(e, lines); }
    }
    if (this.storeUnknown) this.storeCheck();   // the server can be reached once its store has answered: its save is asked for
    if (this.storeBroken || this.storeUnknown || !c.ready || !c.receipts.length) {   // nothing is tried now: nothing is listed as kept for later
      this.storeHeld = [];
      if (this.storeListed) { this.storeListed = ''; this.store?.render(); }   // drawn again when the list changed, as below
      return;
    }
    // A time skip is paid by what the workers bring in without the timed boosts, as time away is: the calm rate (js/sim/store.js, calmStep).
    // Not while the page load's absence is held (js/game/saving.js, awayAtLoad): that pay is owed at the rate that was saved.
    if (!this.awayHeld) this.econ.workerRate = this.calmRate.rate;
    this.company.refreshGoals(today());   // after midnight the day's goals first: a New goals purchase is for today's list, never for yesterday's
    let done;
    try { done = applyReceipts(this.company, c.receipts, this.company.catalog, now); } catch (e) {
      this.storeStop(e, lines);   // better no store for the rest of this visit than the same failure every second
      return;
    }
    const held = [], gates = [], said = lines.length;
    let changed = false, failed = false;
    for (const d of done) {
      if (d.done.kind === 'failed') {   // kept, and tried again: the others go on
        failed = true;
        held.push({ id: d.receipt.id, name: d.item.name, why: 'Something went wrong when it was applied. It is tried again by itself.' });   // listed on the store's page with what waits
        if (!this.storeFailed.has(d.receipt.id)) { this.storeFailed.add(d.receipt.id); console.error(`The purchase ${d.receipt.id} (${d.item.id}) could not be applied:`, d.done.error); }
        continue;
      }
      if (d.done.kind === 'world') {
        if (d.done.work !== 'fill_machines') continue;   // work this version does not know: left for a later one
        const goods = fillMachines(this.machineSims());
        if (goods > 0) { markApplied(this.company, d.receipt.id); d.done = { kind: 'filled', goods }; }
        else d.done = { kind: 'wait', why: 'Every machine is full.' };
      }
      if (d.done.kind === 'wait') {
        held.push({ id: d.receipt.id, name: d.item.name, why: d.done.why });
        if (this.storeTold.has(d.receipt.id)) continue;
        this.storeTold.add(d.receipt.id);
      } else changed = true;
      if (d.done.kind === 'gate') gates.push(d.done);   // the rules opened a yard: shown below, once it is saved
      lines.push(receiptLine(d.item, d.done));
    }
    this.storeHeld = held;
    const listed = held.map(h => h.id).join();
    const relisted = listed !== this.storeListed;   // the list of what is kept changed (a purchase failed, or one that failed went through)
    this.storeListed = listed;
    if (failed && !this.storeFailTold) { this.storeFailTold = true; lines.splice(said, 0, 'A purchase could not be applied. It is kept, and tried again later.'); }
    if (lines.length === said) { if (relisted) this.store?.render(); return; }
    if (changed) this.save();   // first: whatever the page does next, what was applied is saved with the receipts that say so
    if (changed) {
      this.hud.setCash(this.econ.cash);
      this.hud.setBoosts(boostChips(this.company, now));   // a boost bought a moment ago shows at once
      this.refreshPlots();
    }
    if (gates.length) this.store?.close?.();   // the store's sheet steps aside first: the yard is what the player paid for
    for (const g of gates) {
      // The yard is open and saved: a world that fails to show it must not stop the rest, nor leave the store's page waiting.
      try { this.showGate(g); } catch (e) {
        console.error(`The yard ${g.name} is open but could not be shown:`, e);
        lines.push(reloadLine(g.name));
      }
    }
    this.store?.render();   // the store's page, if it is open: what an item is worth now, and what is kept for later
  }

  /**
   * Trade cash for credits at the price the store's page showed. The server pays only out of the save it keeps, and
   * takes the price out of that save itself (supabase/migrations/20261119000000_exchange.sql): so the save in play is
   * uploaded first (the game is paused under the store's sheet, so the cash on screen is the cash uploaded), and once the
   * server has traded, the same price comes out of the save in play (tradeCash) and the device takes up the server's new
   * revision, so that its next upload is taken. An answer that is lost leaves nothing done here: the same request is
   * sent again on the next tap, and a device that uploads first is given the server's copy (js/account.js, push).
   * @returns what js/credits.js, exchange, answers, or { ok: false, error } when the game could not get that far
   */
  async storeExchange(price) {
    if (!(this.econ.cash >= price)) return { ok: false, error: `Not enough cash: this costs ${money(price)}, and you have ${money(this.econ.cash)}.` };
    this.save();
    if (!(await this.account.flush())) return { ok: false, error: 'Your game could not be saved to your account just now, so nothing was traded. Try again.' };
    const r = await this.credits.exchange(price);
    if (r.ok && r.price > 0) {
      tradeCash(this.econ, this.company, r.price);
      this.account.adopt(r.adminRev);
      this.save();
    }
    return r;
  }
}
