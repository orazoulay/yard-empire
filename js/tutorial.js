// First-run tutorial: four steps driven by game state, shown in the objective card.
import { fmt } from './format.js';

const WORKER = 'worker1';   // the first purchase of the game: the tutorial ends when it is made
const STEPS = [
  { symbol: 'collect', text: 'Walk into the log pile',          done: g => g.player.carry.type === 'log' && g.player.carry.count >= 3 },
  { symbol: 'deliver', text: 'Drop the logs on the saw',        done: (g, s) => s.delivered },
  { symbol: 'coin', text: 'Take the planks and sell them',   done: (g, s) => g.econ.cash > s.cashAtStart },
  // Done when the worker is hired, not at the first dollar paid: a player who has paid half is still being shown the way.
  { symbol: 'team', text: 'Stand on the plot to hire', done: g => g.econ.has(WORKER) },
];
const LAST = STEPS.length - 1;

/**
 * What the last step says, from the money: sell more while the cash in hand does not cover what is left of the
 * price, go to the plot once it does. The bar counts what is paid and what is in hand, over the price.
 * @returns {{ text: string, symbol: string, sub: string, progress: number, toPlot: boolean }}
 */
export function hireStep({ cash, remaining, cost }) {
  const toPlot = cash >= remaining, have = (cost - remaining) + Math.min(Math.max(0, cash), remaining);
  return {
    text: toPlot ? STEPS[LAST].text : 'Sell planks to hire a worker', symbol: toPlot ? 'team' : 'coin',
    sub: `$${fmt(have)} of $${fmt(cost)}`, progress: cost > 0 ? have / cost : 0, toPlot,
  };
}

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = !game.econ.tutorialDone;
    // A player who left with the worker paid in part comes back to the last step, not to the first.
    this.step = this.active && (game.econ.paid[WORKER] || 0) > 0 ? LAST : 0;
    this.state = { delivered: false, cashAtStart: game.econ.cash };
  }

  restart() {
    this.active = true; this.step = 0;
    this.state = { delivered: false, cashAtStart: this.game.econ.cash };
    this.game.econ.tutorialDone = false;
  }

  finish(skipped = false) {
    if (!this.active) return;
    this.active = false;
    this.game.econ.tutorialDone = true;
    this.game.save();
    if (!skipped) this.game.hud.unlock({ title: 'You got it', desc: 'Follow the green arrows to grow the yard', kicker: 'Tutorial done' });
  }

  update() {
    if (!this.active) return;
    const g = this.game, s = this.state;
    const saw = g.areas[0].stations.find(st => st.type === 'processor');
    if (saw && (saw.sim.inputs > 0 || saw.sim.busy || saw.sim.outputs > 0)) s.delivered = true;
    while (this.active && STEPS[this.step].done(g, s)) {
      this.step++;
      if (this.step >= STEPS.length) this.finish();
    }
  }

  /** The last step as the money stands now, or null on the steps before it. */
  hire() {
    if (this.step !== LAST) return null;
    const e = this.game.econ, u = e.get(WORKER);
    return u ? hireStep({ cash: e.cash, remaining: e.remaining(WORKER), cost: u.cost }) : null;
  }

  card() {
    const st = STEPS[this.step], hire = this.hire();
    const card = { symbol: st.symbol, text: st.text, step: `Step ${this.step + 1} of ${STEPS.length}`, tutorial: true };
    return hire ? { ...card, symbol: hire.symbol, text: hire.text, sub: hire.sub, progress: hire.progress } : card;
  }

  /** The zone to point at for the current step; falls back to the normal objective. */
  zone(obj) {
    const plot = this.game.areas[0].plot;
    if (plot && this.hire()?.toPlot) return plot;
    return obj?.zone || null;
  }
}
