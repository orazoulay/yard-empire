// What the company asks of the game: the once-a-second chores (goals, events, the site, the Factory Manager), the
// trucks, the account offer after a purchase, the helpers bought with credits, selling the company, backups and travel.
import { MOMENTS } from '../ui-logic.js';
import { fmt } from '../format.js';
import { helperChores } from '../sim/helpers.js';

/** The player's local day number (days since 1970): daily and weekly goals follow it. */
export const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
export const SOLD_KEY = 'lumber-tycoon-sold';   // stars of a sale, to celebrate after the reload

/** The company chores of the Game. */
export class CompanyChoresMethods {
  /** One truck load: a finished item leaves a machine of the making yard and lands in a machine of the using yard. */
  truck(route) {
    const out = s => s.type === 'processor' && s.recipe.output === route.item && s.sim.outputs > 0;
    const room = s => s.type === 'processor' && s.sim.roomFor(route.item) > 0;
    const from = this.area(route.from)?.stations.find(out), to = this.area(route.to)?.stations.find(room);
    if (!from || !to || !from.sim.takeOutput()) return false;
    to.sim.put(route.item);
    if (this.near(to.x, to.z)) this.particles.emit({ x: to.x - 2.6, y: 0.6, z: to.z + 2.2 }, { count: 2, color: 0x4fc3f7, speed: 1.4, up: 2.6, life: 0.45, size: 0.12 });
    return true;
  }

  /** Sell the company (Headquarters, Expansion tab): the rules reset the yards, then the world is rebuilt by a reload. */
  sellCompany() {
    const offer = this.company.sell();
    if (!offer) return false;
    this.save(); this.noSave = true;
    try { sessionStorage.setItem(SOLD_KEY, String(offer.stars)); } catch { /* private mode */ }
    location.reload();
    return true;
  }
  /** More to do: replace the game with a backup that was read and checked (js/sim/backup.js). The world is rebuilt by a reload. */
  restore(save) {
    this.noSave = true;
    try { localStorage.setItem(this.saveKey, JSON.stringify(save)); } catch { this.noSave = false; return false; }
    location.reload();
    return true;
  }
  /** Jump to an open yard (from the Expansion tab). What the player carries comes along. */
  travel(id) {
    const a = this.area(id);
    if (!a || !a.open) return false;
    const [x, z] = a.cfg.workerSpawn;
    this.player.pos.set(x + 2, 0, z + 2);
    this.playerArea = a;
    this.camFocus.set(x + 2, 0, z + 2);
    this.particles.emit({ x: x + 2, y: 0.3, z: z + 2 }, { count: 18, color: 0xffffff, speed: 4, up: 4, life: 0.6, size: 0.18, spread: 0.8 });
    return true;
  }
  /** Once a second: new goals when the date changes, and the Factory Manager's shopping. */
  /**
   * Once a second after a purchase: offer the account to a guest who has not been asked, when the cards have had
   * their say and nothing else is on the screen. The sheet decides whether there is anyone to ask (js/account-ui.js).
   */
  accountOffer() {
    if (!(this.offerIn > 0) || --this.offerIn > 0) return;
    const quiet = !this.hqOpen && !this.reveal && !this.hud.sheetOpen && !this.hud.unlockBusy && !this.tutorial.active;
    if (!quiet) { this.offerIn = 1; return; }   // look again in a second
    this.offerAccount?.();
  }
  /** The looks bought with credits, as the server and the player's picks have them: put on, or taken off. */
  applyLooks() {
    this.player.dress(this.credits.look('outfit'));
    const fence = this.credits.look('fence');
    for (const a of this.areas) if (a.open) a.setFence(fence);
  }
  /** Once a second: the helpers bought with credits press the buttons they were bought for (js/sim/helpers.js). */
  helpers() {
    for (const d of helperChores(this.company, id => this.credits.owns(id))) {
      this.afterCompanyAction(d.kind, d.result);
      this.hud.hint(d.kind === 'send' ? `Site Foreman: ${fmt(d.result)} goods sent to the building site` : `Goal Clerk: +$${fmt(d.result.cash)} collected`, 2600);
    }
  }
  companyChores() {
    this.accountOffer();
    this.helpers();
    this.company.refreshGoals(today());
    this.syncSite();   // cheap: it draws only when the picture changes: a stage finished, a build started, another twentieth of a stage arrived
    this.siteChores();
    const c = this.company, event = c.eventNow();
    if ((event?.id || '') !== this.shownEvent) {   // say so when an event starts, and once when the game opens during one
      this.shownEvent = event?.id || '';
      if (event) this.hud.unlock({ icon: event.icon, title: event.name, desc: `${event.desc} until ${event.until}`, kicker: 'Event' });
    }
    // more to do: the Advisor's reading of the machines (it keeps one every five seconds of play)
    if (this.watch.due(c.age)) this.watch.sample(c.age, this.areas.filter(a => a.open).map(a => ({ id: a.id, machines: a.stations.filter(s => s.type === 'processor').map(s => s.sim) })));
    if (!c.mods.autoBuy || !c.settings.autoBuy || this.tutorial.active || this.reveal) return;
    // He pays the same way the player does, one upgrade at a time. Opening a new yard stays the player's call.
    for (const a of this.areas) {
      const plot = a.open && a.plot;
      if (!plot || plot.upgrade.gate) continue;
      const rem = this.econ.remaining(plot.upgrade.id);
      if (rem <= 0 || this.econ.cash < rem) continue;
      const r = this.econ.payToward(plot.upgrade.id, rem);
      if (r.paid > 0) { this.onPay(plot, r); return; }
    }
  }
  /** After a button in the Headquarters: sound, confetti, a line of feedback, and a save. */
  afterCompanyAction(kind, result) {
    this.hud.setCash(this.econ.cash);
    this.refreshPlots();
    if (!result) { this.sfx.click(); return; }
    this.celebrate();   // first, so the line about the action itself is the one that stays on screen
    // How the action feels comes from the one table (MOMENTS); the line of feedback says what happened.
    const moment = kind === 'goal' && result.bonus ? 'bonus' : kind;
    this.feel(MOMENTS[moment] ? moment : 'tap');
    if (kind === 'deliver') {
      this.hud.bumpCash(); this.hq.toast(`Delivered: +$${fmt(result.cash)}, +${result.xp} experience`);
    } else if (kind === 'research') this.hq.toast(`Researched: ${result.name}`);
    else if (kind === 'route') this.hq.toast('The trucks are rolling');
    else if (kind === 'hire') this.hq.toast(`${this.company.team[result.id] > 1 ? 'Trained' : 'Hired'}: ${result.name}`);
    else if (kind === 'goal') {
      this.hud.bumpCash(); this.hq.toast(`+$${fmt(result.cash)}, +${result.xp} experience${result.bonus ? ' with the daily bonus' : ''}`);
    } else if (kind === 'sell') this.hq.toast(`Sold from the warehouse: +$${fmt(result)}`);
    else if (kind === 'build') this.hq.toast(`Building started: ${result.name}`);
    else if (kind === 'send') this.hq.toast(`Sent to the site: ${fmt(result)} goods`);
    this.save();
  }
}
