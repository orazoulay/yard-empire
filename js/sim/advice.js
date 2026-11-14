// @ts-check
// Advice from the books: what holds a yard back, read from its last minute. Pure: no rendering, no browser.
//
// Two parts. YardWatch keeps a minute of readings of each yard's machines, which count for themselves how
// long they stood still and why (js/sim/processor.js). advise() takes the facts of one yard, from the
// company's books and from the watch (Company.yardFacts), and names the one thing that holds it back, with
// what would fix it. A yard that runs well gets no advice, and neither does a yard nothing more can be done
// for: in a finished yard the machines wait for material most of the time, because machines outrun carriers,
// and saying so on every card would bury the advice that matters.

export const ADVICE = {
  every: 5,          // seconds of play between two readings of the machines
  window: 60,        // how far back the advice looks: the same minute the books are smoothed over
  settle: 30,        // seconds a yard must have been watched, and the books measured, before anything is said
  idle: 0.5,         // machines standing still for this share of the minute is a bottleneck; less is the normal breathing of a yard
};

/** A minute of readings per yard: how long its machines stood still, for want of material or with a full output pad. */
export class YardWatch {
  constructor({ every = ADVICE.every, window = ADVICE.window } = {}) {
    this.every = every; this.window = window;
    this.yards = new Map();   // yard id -> { samples: [{ t, starved, blocked }], machines, missing }
    this.t = -Infinity;
  }
  /** True when the next reading is due at play time `t`: the caller can skip gathering the machines otherwise. */
  due(t) { return t < this.t || t - this.t >= this.every; }
  /**
   * Take a reading, if one is due.
   * @param t      seconds of play (the company's age); a time that runs backwards is a new company and starts over
   * @param yards  [{ id, machines: Processor[] }] for every open yard
   */
  sample(t, yards) {
    if (t < this.t) { this.yards.clear(); this.t = -Infinity; }
    if (!this.due(t)) return false;
    this.t = t;
    for (const y of yards) {
      let w = this.yards.get(y.id);
      if (!w) { w = { samples: [], machines: 0, missing: null }; this.yards.set(y.id, w); }
      let starved = 0, blocked = 0, missing = null;
      for (const m of y.machines) { starved += m.starved; blocked += m.blocked; if (!missing && !m.busy) missing = m.missing; }
      w.machines = y.machines.length; w.missing = missing;
      w.samples.push({ t, starved, blocked });
      while (w.samples.length > 2 && t - w.samples[1].t >= this.window) w.samples.shift();   // keep one reading at or past the edge of the window
    }
    return true;
  }
  /**
   * What the machines of one yard did over the last minute.
   * @returns {{ starved: number, blocked: number, missing: string|null, seconds: number }} shares of the time from 0 to 1,
   *          the material a waiting machine lacks right now, and how many seconds the figures cover
   */
  read(id) {
    const w = this.yards.get(id);
    if (!w || w.samples.length < 2 || !w.machines) return { starved: 0, blocked: 0, missing: w?.missing || null, seconds: 0 };
    const a = w.samples[0], b = w.samples[w.samples.length - 1], seconds = b.t - a.t, all = seconds * w.machines;
    const share = v => Math.max(0, Math.min(1, v / all));
    return { starved: share(b.starved - a.starved), blocked: share(b.blocked - a.blocked), missing: w.missing, seconds };
  }
}

const COST_NAME = { materials: 'materials', wages: 'wages', upkeep: 'machine upkeep' };

/**
 * Name the bottleneck of one yard, if it has one.
 * @param y  the facts of the yard, as Company.yardFacts gives them
 * @returns {{ kind, problem, fix, go }|null}  kind: carriers, blocked, starved or loss. problem and fix are sentences for
 *          the player. go: where the fix is made: 'logistics' or 'research' (a Headquarters tab), or 'yard' (on the ground there).
 */
export function advise(y) {
  if (!y || !y.machines) return null;
  const watched = y.watched >= ADVICE.settle;
  const blocked = watched && y.blocked >= ADVICE.idle, starved = watched && y.starved >= ADVICE.idle;
  const what = y.missingLabel || 'material';

  // Nobody carrying: a yard without a worker stands still unless the player or a truck does the carrying.
  if (!y.workers && (blocked || (starved && !(y.routeIn && y.routeIn.owned)))) {
    return { kind: 'carriers', problem: blocked ? 'Nobody carries the finished goods away.' : `Nobody brings ${what} to the machines.`,
      fix: y.canHire ? 'Hire the first worker on the plot in this yard.' : 'Carry a few loads yourself.', go: 'yard' };
  }
  // Output pads full: the machines make goods faster than they are taken away.
  if (blocked) {
    if (y.canHire) return { kind: 'blocked', problem: 'Finished goods pile up at the machines.', fix: 'Hire another worker here.', go: 'yard' };
    if (y.routeOut) return { kind: 'blocked', problem: 'Finished goods pile up at the machines.', fix: 'A truck route out of this yard would take them away.', go: 'logistics' };
    if (y.training) return { kind: 'blocked', problem: 'Finished goods pile up at the machines.', fix: 'Research the Training program: workers walk faster.', go: 'research' };
    return { kind: 'blocked', problem: 'Finished goods pile up at the machines.', fix: 'Carry some to the shop yourself.', go: 'yard' };
  }
  // Machines starved of input: a truck route to buy, a worker to hire, or a supplier that can still grow.
  if (starved) {
    const problem = `The machines wait for ${what} more than half the time.`, r = y.routeIn;
    if (r && !r.owned && r.buyable) return { kind: 'starved', problem, fix: `Buy the truck route from the ${r.from}.`, go: 'logistics' };
    if (y.canHire) return { kind: 'starved', problem, fix: 'Hire another worker here.', go: 'yard' };
    if (r && r.owned && r.grows) return { kind: 'starved', problem, fix: `The ${r.from} cannot make enough. Build it up.`, go: 'yard' };
    if (r && !r.owned) return { kind: 'starved', problem, fix: `It comes from the ${r.from}. Research Trucking to send it by truck.`, go: 'research' };
  }
  // Costs above income, once the books have had a minute.
  if (y.age >= ADVICE.window && y.profit < 0) {
    const problem = `It costs more than it brings in. The largest cost is ${COST_NAME[y.biggest] || 'wages'}.`;
    if (y.biggest === 'wages' && y.payroll) return { kind: 'loss', problem, fix: 'Research the Payroll system to lower wages.', go: 'research' };
    if (y.biggest === 'upkeep' && y.efficient) return { kind: 'loss', problem, fix: 'Research Efficient machines to halve upkeep.', go: 'research' };
    return { kind: 'loss', problem, fix: y.income < 0.01 ? 'Nothing was sold here in the last minute. Get goods to its shop.' : 'It needs more goods to sell. Look at the yards that supply it.', go: 'yard' };
  }
  return null;
}
