// First-run tutorial: four steps driven by game state, shown in the objective card.

const STEPS = [
  { symbol: 'collect', text: 'Walk into the log pile',          done: g => g.player.carry.type === 'log' && g.player.carry.count >= 3 },
  { symbol: 'deliver', text: 'Drop the logs on the saw',        done: (g, s) => s.delivered },
  { symbol: 'coin', text: 'Take the planks and sell them',   done: (g, s) => g.econ.cash > s.cashAtStart },
  { symbol: 'team', text: 'Stand on the plot to buy a worker', done: g => (g.econ.paid.worker1 || 0) > 0 || g.econ.has('worker1') },
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = !game.econ.tutorialDone;
    this.step = 0;
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

  card() {
    const st = STEPS[this.step];
    return { symbol: st.symbol, text: st.text, step: `Step ${this.step + 1} of ${STEPS.length}`, tutorial: true };
  }

  /** The zone to point at for the current step; falls back to the normal objective. */
  zone(obj) {
    const g = this.game, a = g.areas[0];
    if (this.step === 3 && a.plot) return a.plot;
    return obj?.zone || null;
  }
}
