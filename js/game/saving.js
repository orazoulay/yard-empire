// Saving, and paying for time away: the save is the economy as JSON beside the account's key; checkOffline pays
// what the yards earned while the game was closed or asleep.
import { offlineEarnings, OFFLINE_EFFICIENCY } from '../sim/offline.js';
import { today } from './company-chores.js';

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
    this.econ.lastSeen = now;   // the same absence is never paid twice
    if (r.earned < 1) return;
    this.company.useAway(r.seconds);
    this.offlineOpen = true;
    // yard interface: the sheet gets the terms of the pay as figures (how long away, the share, what is left of today) and words them itself
    this.hud.showOffline({ earned: r.earned, seconds: r.seconds, capped: r.capped, away, share: terms.share || OFFLINE_EFFICIENCY,
      afterCosts: terms.costs > 0, left: this.company.awayLeft(), allowance: this.company.awayAllowance() }, () => {
      this.offlineOpen = false;
      this.company.earn(r.earned);
      this.hud.setCash(this.econ.cash);
      this.refreshPlots();
      this.sfx.unlock(); this.sfx.collect(); this.settings.buzz([20, 40, 20]);
      for (let i = 0; i < 10; i++) setTimeout(() => this.fx.money(this.player.headPos, () => this.hud.bumpCash()), i * 45);
      this.save();
    });
  }

  save() {
    if (this.noSave) return;   // set while resetting, so the unload save cannot bring the old game back
    this.econ.workerRate = this.meter.rate;
    if (!this.offlineOpen) this.econ.lastSeen = Date.now();
    try { localStorage.setItem(this.saveKey, JSON.stringify(this.econ)); } catch { /* private mode */ }
  }
}
