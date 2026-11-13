// Pure processing-station logic: N inputs in, M outputs out, timed. Used for saws, workshops, ...
// A recipe may name a second material (input2, inCount2): the machine then needs enough of both.

export class Processor {
  constructor(recipe, { inputCap = 12, outputCap = 24 } = {}) {
    this.recipe = recipe;         // { inCount, outCount, time }
    this.inputCap = inputCap;
    this.outputCap = outputCap;
    this.inputs = 0;
    this.inputs2 = 0;             // the second material, for recipes that have one
    this.outputs = 0;
    this.progress = 0;            // 0..1 of the current batch
    this.busy = false;
    // Seconds this machine has stood still, by reason, since it was built. The Advisor compares two readings
    // a minute apart (js/sim/advice.js) to say whether a yard lacks material or has nowhere to put its goods.
    this.starved = 0;             // ... for want of material
    this.blocked = 0;             // ... with a full output pad
  }

  get inputFull() { return this.inputs >= this.inputCap; }
  get inputFree() { return Math.max(0, this.inputCap - this.inputs); }
  get outputFull() { return this.outputs + this.recipe.outCount > this.outputCap; }
  get two() { return !!this.recipe.input2; }
  get input2Full() { return this.inputs2 >= this.inputCap; }
  get inputFree2() { return this.two ? Math.max(0, this.inputCap - this.inputs2) : 0; }
  get canStart() { return this.inputs >= this.recipe.inCount && (!this.two || this.inputs2 >= this.recipe.inCount2) && !this.outputFull; }
  /** True if this machine ever takes `item`, full or not. */
  uses(item) { return item != null && (item === this.recipe.input || item === this.recipe.input2); }
  /** How many of `item` wait on the input pad; 0 when the machine does not use it. The feeder reads it (js/sim/jobs.js). */
  holds(item) { return item === this.recipe.input ? this.inputs : this.two && item === this.recipe.input2 ? this.inputs2 : 0; }
  /** How many of `item` one batch takes. */
  batchOf(item) { return item === this.recipe.input ? this.recipe.inCount : this.two && item === this.recipe.input2 ? this.recipe.inCount2 : 1; }
  /** The materials, first one first. */
  get materials() { return this.two ? [this.recipe.input, this.recipe.input2] : [this.recipe.input]; }
  /** Free room for `item`; 0 when the machine does not use it. */
  roomFor(item) { return item === this.recipe.input ? this.inputFree : item === this.recipe.input2 ? this.inputFree2 : 0; }
  /** Put one `item` in. @param force even past the limit (the player may always empty their hands) */
  put(item, force = false) {
    if (item === this.recipe.input) return this.addInput(force);
    if (!this.two || item !== this.recipe.input2 || (this.input2Full && !force)) return false;
    this.inputs2++;
    return true;
  }
  /** The material a batch is waiting for, or null when it has enough of everything. */
  get missing() {
    if (this.inputs < this.recipe.inCount) return this.recipe.input;
    if (this.two && this.inputs2 < this.recipe.inCount2) return this.recipe.input2;
    return null;
  }
  consume() { this.inputs -= this.recipe.inCount; if (this.two) this.inputs2 -= this.recipe.inCount2; }

  /** @param force  put the item in even past the cap (the player may always empty their hands) */
  addInput(force = false) {
    if (this.inputFull && !force) return false;
    this.inputs++;
    return true;
  }

  takeOutput() {
    if (this.outputs === 0) return false;
    this.outputs--;
    return true;
  }

  /** Advance by dt seconds at the given speed multiplier. Returns batches finished. */
  step(dt, speed = 1) {
    let finished = 0;
    if (!this.busy) {
      if (!this.canStart) {
        if (this.outputFull) this.blocked += dt; else this.starved += dt;
        return 0;
      }
      this.busy = true; this.consume(); this.progress = 0;
    }
    this.progress += (dt * speed) / this.recipe.time;
    while (this.progress >= 1) {
      this.outputs += this.recipe.outCount;
      finished++;
      this.progress -= 1;
      if (this.canStart) { this.consume(); }
      else { this.busy = false; this.progress = 0; break; }
    }
    return finished;
  }
}
