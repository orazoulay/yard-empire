// Saving, and paying for time away: the save is the economy as JSON beside the account's key; checkOffline pays
// what the yards earned while the game was closed or asleep.
import { offlineEarnings, awaySeconds, OFFLINE_EFFICIENCY } from '../sim/offline.js';
import { today } from './company-chores.js';
import { awayPay, flagValue } from '../sim/store.js';

/**
 * How long the pay for time away at page load waits for the store's answer (ms). What is owned for good counts only
 * once the server has said so (js/credits.js), and A full day away changes the allowance: without the wait the
 * absence would be paid before the answer, by the ordinary allowance. A slow or dead connection waits no longer than this.
 */
export const AWAY_WAIT_MS = 5000;

/** The saving of the Game. */
export class SavingMethods {
  /** Pay for time away: on load, and whenever the loop wakes up after a long pause. */
  checkOffline() {
    if (this.offlineOpen) return;
    const now = Date.now();
    this.company.refreshGoals(today());          // a new day refills the allowance for time away
    const terms = this.company.offlineTerms();   // wages and upkeep come off; the limit is what is left of today's allowance
    const away = (now - this.econ.lastSeen) / 1000;
    const r = offlineEarnings({ rate: this.econ.workerRate, lastSeen: this.econ.lastSeen, now, ...terms });
    // A ship at sea sails on by the same seconds as the pay, at the same share, whether the yards earned or not. These
    // seconds are never also run through the rules: the frame that called this catches up a quarter of a second at most.
    const secs = awaySeconds({ lastSeen: this.econ.lastSeen, now, cap: terms.cap });
    const sailing = secs > 0 && this.company.port.ships.some(s => s.left > 0);
    // A ship that came home is told of once: by the welcome-back sheet when there is one (the yards earned), else by its own card.
    const sea = sailing ? this.company.shipsAway(secs * (terms.share || OFFLINE_EFFICIENCY), r.earned >= 1) : { ships: 0, cash: 0 };
    this.econ.lastSeen = now;   // the same absence is never paid twice
    if (r.earned < 1) {
      if (sailing) { this.company.useAway(secs); this.hud.setCash(this.econ.cash); this.save(); }   // a ship sailed on the allowance though the yards paid nothing
      return;
    }
    const times = flagValue(this.company, 'awayX2');   // a Double welcome-back of the credits store that waits: shown now, used when the pay is collected
    this.company.useAway(r.seconds);   // once, for the pay and the ships together (r.seconds and secs are the same whole seconds)
    this.offlineOpen = true;
    // yard interface: the sheet gets the terms of the pay as figures (how long away, the share, what is left of today) and words them itself
    this.hud.showOffline({ earned: Math.floor(r.earned * times), seconds: r.seconds, capped: r.capped, away, share: terms.share || OFFLINE_EFFICIENCY,
      afterCosts: terms.costs > 0, left: this.company.awayLeft(), allowance: this.company.awayAllowance(), times, accountant: this.company.mods.awayPay > 1, ships: sea }, () => {
      this.offlineOpen = false;
      this.company.earn(awayPay(this.company, r.earned).earned);
      this.hud.setCash(this.econ.cash);
      this.refreshPlots();
      this.sfx.unlock(); this.sfx.collect(); this.settings.buzz([20, 40, 20]);
      for (let i = 0; i < 10; i++) setTimeout(() => this.fx.money(this.player.headPos, () => this.hud.bumpCash()), i * 45);
      this.save();
    });
  }

  /**
   * At page load: pay for time away at once, or, while the store's answer is on its way (a signed-in player on a server
   * with credits), hold the absence until it arrives, AWAY_WAIT_MS at most. Called after bindStoreRules(), so its
   * listener runs after what is owned has been folded into the company. While the absence is held, saving keeps the old
   * last-seen time: a tab closed meanwhile pays the whole absence on the next visit.
   */
  awayAtLoad() {
    if (this.credits.status !== 'loading') { this.checkOffline(); return; }   // a guest, a server without credits, no connection, or the answer already in
    this.awayHeld = true;
    const pay = () => {
      if (!this.awayHeld) return;   // once for the page load, whichever comes first
      this.awayHeld = false;
      clearTimeout(timer);
      this.checkOffline();
    };
    const timer = setTimeout(pay, AWAY_WAIT_MS);
    this.credits.onChange(c => { if (c.status !== 'loading') pay(); });
  }

  save() {
    if (this.noSave) return;   // set while resetting, so the unload save cannot bring the old game back
    // what the workers bring in without the timed boosts of the credits store (the calm rate, js/sim/store.js): a boost ends by the clock, and time away must not carry it on.
    // While the page load's absence is held, the rate stays the one that was saved: the absence is paid by what the workers earned before it, not by the first seconds of this visit.
    if (!this.awayHeld) this.econ.workerRate = this.calmRate.rate;
    if (!this.offlineOpen && !this.awayHeld) this.econ.lastSeen = Date.now();   // an absence still held keeps its start
    try { localStorage.setItem(this.saveKey, JSON.stringify(this.econ)); } catch { /* private mode */ }
  }
}
